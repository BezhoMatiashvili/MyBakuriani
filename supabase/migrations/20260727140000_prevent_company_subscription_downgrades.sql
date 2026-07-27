-- Keep active company subscriptions on a strict, forward-only tier ladder.
-- Existing historical downgrades are intentionally left untouched.
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

  SELECT amount_gel, meta INTO v_amount, v_meta
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
          format('კომპანიის გამოწერა: %s (%s)', v_brand, upper(p_tier)), p_org_id);

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
    format('კომპანიის "%s" %s პაკეტი გააქტიურდა.', v_brand, upper(p_tier)),
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
