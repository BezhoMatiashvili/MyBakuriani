-- Fix: company page shows 0 projects / 0 apartments despite an active package.
-- A property could only be tagged to an organization at INSERT time (create/sale
-- flow), and only if the org already had an active subscription then — so
-- listings created before the package purchase could never be attached.
--
-- This migration:
--   1. _auto_link_org_sale_listings(org, owner) — links the owner's untagged
--      SALE listings (is_for_sale = true, organization_id IS NULL) to the org,
--      oldest first, capped at the subscription's remaining listing quota so
--      enforce_org_listing_rules never aborts the purchase transaction.
--   2. purchase_company_subscription — calls the helper after activating the
--      subscription (auto-link on every package purchase). Signature/return
--      shape unchanged.
--   3. prevent_listing_protected_field_change — lets the row OWNER change
--      organization_id from a client session (edit-flow attach/detach);
--      enforce_org_listing_rules still validates membership + active sub +
--      listing cap on every attach. Rentals are unaffected (the edit UI is
--      sale-only and the helper filters is_for_sale).
--   4. One-time backfill for orgs that already hold an active subscription.

-- ---------------------------------------------------------------------------
-- 1. Helper: link owner's untagged sale listings to an org, within quota
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._auto_link_org_sale_listings(
  p_org_id uuid,
  p_owner_id uuid
)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_limit int;
  v_unlimited boolean := false;
  v_remaining int;  -- stays NULL when unlimited
  v_linked int := 0;
BEGIN
  SELECT s.listing_limit, (s.listing_limit IS NULL)
    INTO v_limit, v_unlimited
  FROM public.organization_subscriptions s
  WHERE s.organization_id = p_org_id
    AND s.status = 'active'
    AND s.expires_at > now()
  ORDER BY s.expires_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN 0;  -- no active subscription: nothing to link
  END IF;

  IF NOT v_unlimited THEN
    SELECT greatest(0, v_limit - count(*))::int INTO v_remaining
    FROM public.properties p
    WHERE p.organization_id = p_org_id;
    IF v_remaining = 0 THEN
      RETURN 0;
    END IF;
  END IF;

  UPDATE public.properties p
  SET organization_id = p_org_id
  WHERE p.id IN (
    SELECT id FROM public.properties
    WHERE owner_id = p_owner_id
      AND organization_id IS NULL
      AND is_for_sale = true
    ORDER BY created_at ASC
    LIMIT coalesce(v_remaining, 2147483647)
  );
  GET DIAGNOSTICS v_linked = ROW_COUNT;
  RETURN v_linked;
END;
$$;
REVOKE ALL ON FUNCTION public._auto_link_org_sale_listings(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._auto_link_org_sale_listings(uuid, uuid)
  TO service_role;

-- ---------------------------------------------------------------------------
-- 2. purchase_company_subscription — body copied from 20260627090200_org_rpcs.sql
--    verbatim, plus the auto-link call after the subscription insert (the
--    enforcement trigger's active-sub check needs the new row in place).
-- ---------------------------------------------------------------------------
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
  v_expires timestamptz := now() + interval '30 days';
  v_sub_id uuid;
BEGIN
  IF p_tier NOT IN ('entry', 'pro', 'premium') THEN
    RAISE EXCEPTION 'არასწორი პაკეტი' USING ERRCODE = '22023';
  END IF;

  SELECT owner_id, brand_name INTO v_owner, v_brand
  FROM public.organizations WHERE id = p_org_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'კომპანია ვერ მოიძებნა' USING ERRCODE = 'P0002';
  END IF;
  IF v_owner <> p_user_id THEN
    RAISE EXCEPTION 'მხოლოდ კომპანიის მფლობელს შეუძლია პაკეტის შეძენა' USING ERRCODE = '42501';
  END IF;

  SELECT amount_gel, meta INTO v_amount, v_meta
  FROM public.pricing_packages
  WHERE category = 'subscription' AND code = 'company-' || p_tier AND is_enabled = true
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'პაკეტი ვერ მოიძებნა' USING ERRCODE = 'P0002';
  END IF;

  v_limit := NULLIF(v_meta ->> 'listing_limit', '')::int;  -- NULL = unlimited

  -- Lock owner balance (create if missing)
  INSERT INTO public.balances (user_id, amount, sms_remaining)
  VALUES (p_user_id, 0, 0) ON CONFLICT (user_id) DO NOTHING;

  SELECT amount INTO v_balance FROM public.balances WHERE user_id = p_user_id FOR UPDATE;

  IF coalesce(v_balance, 0) < v_amount THEN
    RAISE EXCEPTION 'არასაკმარისი ბალანსი. საჭიროა: % ₾, ხელმისაწვდომია: % ₾',
      v_amount, coalesce(v_balance, 0) USING ERRCODE = '22023';
  END IF;

  v_new_balance := v_balance - v_amount;
  UPDATE public.balances SET amount = v_new_balance, updated_at = now() WHERE user_id = p_user_id;

  INSERT INTO public.transactions (user_id, amount, type, description, reference_id)
  VALUES (p_user_id, -v_amount, 'commission',
          format('კომპანიის გამოწერა: %s (%s)', v_brand, upper(p_tier)), p_org_id);

  -- Replace any current active subscription for this org
  UPDATE public.organization_subscriptions
  SET status = 'expired'
  WHERE organization_id = p_org_id AND status = 'active';

  INSERT INTO public.organization_subscriptions
    (organization_id, tier, listing_limit, amount_gel, starts_at, expires_at, status)
  VALUES (p_org_id, p_tier, v_limit, v_amount, now(), v_expires, 'active')
  RETURNING id INTO v_sub_id;

  -- Attach the owner's untagged sale listings to the freshly subscribed org.
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

-- ---------------------------------------------------------------------------
-- 3. prevent_listing_protected_field_change — body copied from
--    20260719120000_fix_discount_badge_duration.sql verbatim, plus the
--    owner-may-move-own-listing exception in the properties branch.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.prevent_listing_protected_field_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  caller_role text;
  status_changed boolean;
  status_locked boolean;
  org_changed boolean := false;
BEGIN
  status_changed := NEW.status::text IS DISTINCT FROM OLD.status::text;

  IF TG_TABLE_NAME = 'services' THEN
    -- Only block leaving 'pending' (the self-approval bypass); owners can
    -- freely toggle active/draft/blocked on an already-moderated listing.
    status_locked := status_changed AND OLD.status::text = 'pending';
  ELSE
    status_locked := status_changed;
  END IF;

  -- organization_id exists only on `properties`. Keep the reference inside this
  -- branch so it is never resolved against the `services` rowtype.
  IF TG_TABLE_NAME = 'properties' THEN
    org_changed := NEW.organization_id IS DISTINCT FROM OLD.organization_id;
    -- The row owner may attach/detach their own listing to/from a company;
    -- enforce_org_listing_rules still validates approved membership + active
    -- subscription + listing cap on every attach.
    IF org_changed
       AND OLD.owner_id = auth.uid()
       AND NEW.owner_id IS NOT DISTINCT FROM OLD.owner_id THEN
      org_changed := false;
    END IF;
  END IF;

  IF NOT status_locked
     AND NEW.is_vip IS NOT DISTINCT FROM OLD.is_vip
     AND NEW.is_super_vip IS NOT DISTINCT FROM OLD.is_super_vip
     AND NEW.discount_percent IS NOT DISTINCT FROM OLD.discount_percent
     AND NEW.vip_expires_at IS NOT DISTINCT FROM OLD.vip_expires_at
     AND NEW.discount_expires_at IS NOT DISTINCT FROM OLD.discount_expires_at
     AND NEW.owner_id IS NOT DISTINCT FROM OLD.owner_id
     AND NOT org_changed
  THEN
    RETURN NEW;
  END IF;

  BEGIN
    caller_role := auth.role();
  EXCEPTION WHEN OTHERS THEN
    caller_role := NULL;
  END;

  IF caller_role IS NULL OR caller_role = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin') THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION
    'Changing status/is_vip/is_super_vip/discount_percent/vip_expires_at/discount_expires_at/owner_id/organization_id is not permitted from a non-admin user session'
    USING ERRCODE = '42501';
END;
$function$;

-- ---------------------------------------------------------------------------
-- 4. One-time backfill: orgs that already hold an active subscription get the
--    owner's untagged sale listings linked now (deterministic per-org order).
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT DISTINCT ON (s.organization_id) s.organization_id, o.owner_id
    FROM public.organization_subscriptions s
    JOIN public.organizations o ON o.id = s.organization_id
    WHERE s.status = 'active' AND s.expires_at > now()
    ORDER BY s.organization_id, s.starts_at ASC
  LOOP
    PERFORM public._auto_link_org_sale_listings(r.organization_id, r.owner_id);
  END LOOP;
END;
$$;
