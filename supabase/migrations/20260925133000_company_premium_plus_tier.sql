-- 2026 price list (MyBakuriani_ფასების_ცხრილი_და_განმარტებები_2026.docx §5): developer
-- packages START 100 ₾ (≤10) · PRO 200 ₾ (≤50) · PREMIUM 350 ₾ (unlimited) ·
-- PREMIUM+ 500 ₾ (unlimited). START is the existing `entry` tier renamed in
-- 20260925130000 (display name only); PREMIUM+ is a new 4th tier, code `premium_plus`.
--
-- The tier string is coupled across: this CHECK, both rank CASE lists in
-- purchase_company_subscription, the `company-<tier>` pricing_packages code, the
-- company-subscription edge function's VALID_TIERS, and src/lib/org-tiers.ts
-- (scripts/check-contracts.mjs + scripts/check-db-contracts.mjs compare them).
--
-- purchase_company_subscription is restated verbatim from 20260727140000 (live md5
-- verified) except: premium_plus ranks 4 in both CASE lists, and the transaction /
-- notification text names the package (START / PRO / PREMIUM / PREMIUM+) instead of
-- upper(p_tier), which would read "ENTRY" / "PREMIUM_PLUS".

ALTER TABLE public.organization_subscriptions
  DROP CONSTRAINT organization_subscriptions_tier_check;
ALTER TABLE public.organization_subscriptions
  ADD CONSTRAINT organization_subscriptions_tier_check
  CHECK (tier = ANY (ARRAY['entry'::text, 'pro'::text, 'premium'::text, 'premium_plus'::text]));

CREATE OR REPLACE FUNCTION public.purchase_company_subscription(
  p_user_id uuid,
  p_org_id uuid,
  p_tier text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_owner uuid;
  v_brand text;
  v_name text;
  v_amount numeric;
  v_meta jsonb;
  v_limit int;
  v_balance numeric;
  v_new_balance numeric;
  v_requested_rank int;
  v_active_rank int;
  v_expires timestamptz := now() + interval '30 days';
  v_sub_id uuid;
BEGIN
  v_requested_rank := CASE p_tier
    WHEN 'entry' THEN 1
    WHEN 'pro' THEN 2
    WHEN 'premium' THEN 3
    WHEN 'premium_plus' THEN 4
    ELSE NULL
  END;
  IF v_requested_rank IS NULL THEN
    RAISE EXCEPTION 'არასწორი პაკეტი' USING ERRCODE = '22023';
  END IF;

  -- Serialize all purchases for this company before inspecting its active tier.
  SELECT owner_id, brand_name INTO v_owner, v_brand
  FROM public.organizations
  WHERE id = p_org_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'კომპანია ვერ მოიძებნა' USING ERRCODE = 'P0002';
  END IF;
  IF v_owner <> p_user_id THEN
    RAISE EXCEPTION 'მხოლოდ კომპანიის მფლობელს შეუძლია პაკეტის შეძენა' USING ERRCODE = '42501';
  END IF;

  -- Only rows that are active and not yet expired constrain a new purchase.
  SELECT max(CASE tier
    WHEN 'entry' THEN 1
    WHEN 'pro' THEN 2
    WHEN 'premium' THEN 3
    WHEN 'premium_plus' THEN 4
  END)
  INTO v_active_rank
  FROM public.organization_subscriptions
  WHERE organization_id = p_org_id
    AND status = 'active'
    AND expires_at > now();

  -- Same-tier renewals and downgrades wait until the current term expires.
  IF v_active_rank IS NOT NULL AND v_requested_rank <= v_active_rank THEN
    RAISE EXCEPTION 'SUBSCRIPTION_TIER_LOCKED' USING ERRCODE = 'P0001';
  END IF;

  SELECT name, amount_gel, meta INTO v_name, v_amount, v_meta
  FROM public.pricing_packages
  WHERE category = 'subscription' AND code = 'company-' || p_tier AND is_enabled = true
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'პაკეტი ვერ მოიძებნა' USING ERRCODE = 'P0002';
  END IF;

  v_limit := NULLIF(v_meta ->> 'listing_limit', '')::int;

  INSERT INTO public.balances (user_id, amount, sms_remaining)
  VALUES (p_user_id, 0, 0) ON CONFLICT (user_id) DO NOTHING;

  SELECT amount INTO v_balance
  FROM public.balances
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF coalesce(v_balance, 0) < v_amount THEN
    RAISE EXCEPTION 'არასაკმარისი ბალანსი. საჭიროა: % ₾, ხელმისაწვდომია: % ₾',
      v_amount, coalesce(v_balance, 0) USING ERRCODE = '22023';
  END IF;

  v_new_balance := v_balance - v_amount;
  UPDATE public.balances SET amount = v_new_balance, updated_at = now() WHERE user_id = p_user_id;

  INSERT INTO public.transactions (user_id, amount, type, description, reference_id)
  VALUES (p_user_id, -v_amount, 'commission',
          format('კომპანიის გამოწერა: %s (%s)', v_brand, v_name), p_org_id);

  UPDATE public.organization_subscriptions
  SET status = 'expired'
  WHERE organization_id = p_org_id AND status = 'active';

  INSERT INTO public.organization_subscriptions
    (organization_id, tier, listing_limit, amount_gel, starts_at, expires_at, status)
  VALUES (p_org_id, p_tier, v_limit, v_amount, now(), v_expires, 'active')
  RETURNING id INTO v_sub_id;

  PERFORM public._auto_link_org_sale_listings(p_org_id, p_user_id);

  PERFORM public._notify(
    p_user_id,
    'company_subscription',
    'გამოწერა გააქტიურდა',
    format('კომპანიის "%s" %s პაკეტი გააქტიურდა.', v_brand, v_name),
    format('/dashboard/seller/organizations/%s', p_org_id)
  );

  RETURN json_build_object(
    'subscription_id', v_sub_id,
    'tier', p_tier,
    'listing_limit', v_limit,
    'cost', v_amount,
    'new_balance', v_new_balance,
    'expires_at', v_expires
  );
END;
$$;

REVOKE ALL ON FUNCTION public.purchase_company_subscription(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purchase_company_subscription(uuid, uuid, text) TO service_role;

INSERT INTO public.pricing_packages
  (category, code, name, label, amount_gel, is_enabled, sort_order, description, meta)
VALUES
  ('subscription', 'company-premium_plus', 'PREMIUM+', 'ულიმიტო ბინა', 500, true, 70, NULL,
   '{"listing_limit": null, "subscription_scope": "organization"}'::jsonb)
ON CONFLICT (category, code) DO UPDATE SET
  name        = EXCLUDED.name,
  label       = EXCLUDED.label,
  amount_gel  = EXCLUDED.amount_gel,
  is_enabled  = EXCLUDED.is_enabled,
  sort_order  = EXCLUDED.sort_order,
  description = EXCLUDED.description,
  meta        = EXCLUDED.meta,
  updated_at  = now();

NOTIFY pgrst, 'reload schema';
