-- VIP purchase fixes (2026-09-26, s-vip-purchase-0926). Bodies are generated
-- from the live definitions (md5-verified against 20260905121000 and
-- 20260723000000) with targeted edits only; signatures are unchanged.
--
-- 1. force_listing_moderation_state: reset is_super_vip on services too (an
--    owner could INSERT a service with is_super_vip = true; the NULL expiry the
--    trigger forced made it a permanent SUPER VIP after approval), plus
--    discount_expires_at and vip_expiry_notified_at.
-- 2. purchase_package: re-buying the same ACTIVE tier extends from the current
--    expiry instead of restarting from now; unknown meta.tier is rejected; every
--    user-facing error carries an ASCII HINT reason token (invalid_quantity,
--    package_unavailable, invalid_target, not_owner, insufficient_balance,
--    invalid_discount_percent) that purchase-vip maps to localized copy;
--    expires_at is returned for VIP purchases too.

CREATE OR REPLACE FUNCTION public.force_listing_moderation_state()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO public
AS $function$
BEGIN
  IF auth.role() IS NULL OR auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;
  IF public.is_admin_user() THEN
    RETURN NEW;
  END IF;

  NEW.status := 'pending';
  NEW.is_vip := false;
  -- services has is_super_vip too. Resetting it only for properties let an
  -- owner insert a service that became a permanent (NULL-expiry) SUPER VIP
  -- once approved, since every reader treats a NULL expiry as active.
  NEW.is_super_vip := false;
  NEW.discount_percent := 0;
  NEW.discount_expires_at := NULL;
  NEW.vip_expires_at := NULL;
  NEW.vip_expiry_notified_at := NULL;
  IF TG_TABLE_NAME = 'properties' THEN
    NEW.organization_id := NULL;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.purchase_package(
  p_user_id uuid,
  p_package_id uuid,
  p_property_id uuid DEFAULT NULL::uuid,
  p_service_id uuid DEFAULT NULL::uuid,
  p_quantity integer DEFAULT 1,
  p_discount_percent integer DEFAULT NULL::integer
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_pkg RECORD;
  v_cost NUMERIC;
  v_total_cost NUMERIC;
  v_balance NUMERIC;
  v_sms_remaining INT;
  v_new_balance NUMERIC;
  v_new_sms INT;
  v_sms_count INT;
  v_duration_hours INT;
  v_duration_months INT;
  v_tier TEXT;
  v_expires_at TIMESTAMPTZ;
  v_valid_from TIMESTAMPTZ;
  v_valid_to TIMESTAMPTZ;
  v_membership_start TIMESTAMPTZ;
  v_tx_type transaction_type;
  v_description TEXT;
  v_scope TEXT;
  v_cur_vip BOOLEAN;
  v_cur_super BOOLEAN;
  v_cur_vip_exp TIMESTAMPTZ;
  v_cur_disc INT;
  v_cur_disc_exp TIMESTAMPTZ;
  v_base TIMESTAMPTZ;
BEGIN
  IF p_quantity IS NULL OR p_quantity < 1 OR p_quantity > 365 THEN
    RAISE EXCEPTION 'არასწორი რაოდენობა' USING ERRCODE = '22023', HINT = 'invalid_quantity';
  END IF;

  SELECT id, category, code, name, amount_gel, is_enabled, meta
    INTO v_pkg
  FROM pricing_packages
  WHERE id = p_package_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'პაკეტი ვერ მოიძებნა' USING ERRCODE = 'P0002', HINT = 'package_unavailable';
  END IF;
  IF NOT v_pkg.is_enabled THEN
    RAISE EXCEPTION 'პაკეტი არ არის ხელმისაწვდომი' USING ERRCODE = '22023', HINT = 'package_unavailable';
  END IF;

  -- A company subscription is bought through purchase_company_subscription,
  -- never through the personal wallet endpoint.
  IF v_pkg.category = 'subscription'
     AND coalesce(v_pkg.meta ->> 'subscription_scope', '') = 'organization' THEN
    RAISE EXCEPTION 'კომპანიის პაკეტი პირადი წევრობისთვის მიუწვდომელია' USING ERRCODE = '22023';
  END IF;

  -- Renter plans are account-level and must not be attached to a listing.
  IF v_pkg.category = 'subscription'
     AND v_pkg.meta ->> 'subscription_scope' = 'renter' THEN
    IF p_quantity <> 1 THEN
      RAISE EXCEPTION 'საწევრო პაკეტის რაოდენობა უნდა იყოს 1' USING ERRCODE = '22023';
    END IF;
    IF p_property_id IS NOT NULL OR p_service_id IS NOT NULL THEN
      RAISE EXCEPTION 'საწევრო პაკეტი ობიექტის არჩევას არ საჭიროებს' USING ERRCODE = '22023';
    END IF;
    v_duration_months := NULLIF(v_pkg.meta ->> 'duration_months', '')::int;
    IF v_duration_months NOT IN (1, 3) THEN
      RAISE EXCEPTION 'საწევრო პაკეტი არასწორად არის კონფიგურირებული' USING ERRCODE = '22023';
    END IF;
  END IF;

  v_cost := v_pkg.amount_gel;
  v_total_cost := v_cost * p_quantity;

  IF v_pkg.category = 'vip' THEN
    IF (p_property_id IS NULL) = (p_service_id IS NULL) THEN
      RAISE EXCEPTION 'VIP პაკეტისთვის აირჩიეთ ზუსტად ერთი ობიექტი' USING ERRCODE = '22023', HINT = 'invalid_target';
    END IF;
    IF p_property_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM properties WHERE id = p_property_id AND owner_id = p_user_id
    ) THEN
      RAISE EXCEPTION 'ობიექტი ვერ მოიძებნა ან თქვენ არ ხართ მფლობელი' USING ERRCODE = '42501', HINT = 'not_owner';
    END IF;
    IF p_service_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM services WHERE id = p_service_id AND owner_id = p_user_id
    ) THEN
      RAISE EXCEPTION 'სერვისი ვერ მოიძებნა ან თქვენ არ ხართ მფლობელი' USING ERRCODE = '42501', HINT = 'not_owner';
    END IF;
  END IF;

  INSERT INTO balances (user_id, amount, sms_remaining)
  VALUES (p_user_id, 0, 0) ON CONFLICT (user_id) DO NOTHING;
  SELECT amount, sms_remaining INTO v_balance, v_sms_remaining
  FROM balances WHERE user_id = p_user_id FOR UPDATE;
  IF v_balance < v_total_cost THEN
    RAISE EXCEPTION 'არასაკმარისი ბალანსი. საჭიროა: % ₾, ხელმისაწვდომია: % ₾',
      v_total_cost, v_balance USING ERRCODE = '22023', HINT = 'insufficient_balance';
  END IF;

  v_new_balance := v_balance - v_total_cost;
  v_new_sms := COALESCE(v_sms_remaining, 0);

  IF v_pkg.category = 'sms' THEN
    v_sms_count := COALESCE((v_pkg.meta ->> 'sms_count')::int, 0);
    IF v_sms_count <= 0 THEN RAISE EXCEPTION 'SMS პაკეტი არასწორად არის კონფიგურირებული' USING ERRCODE = '22023'; END IF;
    v_new_sms := v_new_sms + v_sms_count * p_quantity;
    v_tx_type := 'sms_package';
    v_description := format('%s (%s ცალი)', v_pkg.name, p_quantity);
  ELSIF v_pkg.category = 'vip' THEN
    v_duration_hours := COALESCE((v_pkg.meta ->> 'duration_hours')::int, 24);
    v_tier := COALESCE(v_pkg.meta ->> 'tier', 'standard');
    -- An unknown tier used to fall through to standard VIP silently.
    IF v_tier NOT IN ('standard', 'super', 'discount') OR v_duration_hours < 1 THEN
      RAISE EXCEPTION 'VIP პაკეტი არასწორად არის კონფიგურირებული' USING ERRCODE = '22023', HINT = 'package_unavailable';
    END IF;
    -- Re-buying the SAME tier while it is still active extends it from the
    -- current expiry; it used to restart from now and the remaining time was
    -- lost. The row lock serialises concurrent purchases for one listing.
    -- SUPER VIP bought over an active standard VIP still starts now (C23).
    IF p_property_id IS NOT NULL THEN
      SELECT is_vip, is_super_vip, vip_expires_at, discount_percent, discount_expires_at
        INTO v_cur_vip, v_cur_super, v_cur_vip_exp, v_cur_disc, v_cur_disc_exp
      FROM properties WHERE id = p_property_id FOR UPDATE;
    ELSE
      SELECT is_vip, is_super_vip, vip_expires_at, discount_percent, discount_expires_at
        INTO v_cur_vip, v_cur_super, v_cur_vip_exp, v_cur_disc, v_cur_disc_exp
      FROM services WHERE id = p_service_id FOR UPDATE;
    END IF;
    v_base := NOW();
    IF v_tier = 'discount' THEN
      IF COALESCE(v_cur_disc, 0) > 0 AND v_cur_disc_exp > NOW() THEN v_base := v_cur_disc_exp; END IF;
    ELSIF v_tier = 'super' THEN
      IF v_cur_super IS TRUE AND v_cur_vip_exp > NOW() THEN v_base := v_cur_vip_exp; END IF;
    ELSIF v_cur_vip IS TRUE AND v_cur_vip_exp > NOW() THEN
      v_base := v_cur_vip_exp;
    END IF;
    v_expires_at := v_base + make_interval(hours => v_duration_hours * p_quantity);
    IF v_tier = 'discount' THEN
      IF p_discount_percent IS NULL OR p_discount_percent < 1 OR p_discount_percent > 90 THEN RAISE EXCEPTION 'არასწორი ფასდაკლების პროცენტი' USING ERRCODE = '22023', HINT = 'invalid_discount_percent'; END IF;
      IF p_property_id IS NOT NULL THEN UPDATE properties SET discount_percent = p_discount_percent, discount_expires_at = v_expires_at, updated_at = NOW() WHERE id = p_property_id AND owner_id = p_user_id;
      ELSE UPDATE services SET discount_percent = p_discount_percent, discount_expires_at = v_expires_at, updated_at = NOW() WHERE id = p_service_id AND owner_id = p_user_id; END IF;
      v_tx_type := 'discount_badge';
    ELSIF v_tier = 'super' THEN
      IF p_property_id IS NOT NULL THEN UPDATE properties SET is_super_vip = TRUE, vip_expires_at = v_expires_at, vip_expiry_notified_at = NULL, updated_at = NOW() WHERE id = p_property_id AND owner_id = p_user_id;
      ELSE UPDATE services SET is_super_vip = TRUE, vip_expires_at = v_expires_at, vip_expiry_notified_at = NULL, updated_at = NOW() WHERE id = p_service_id AND owner_id = p_user_id; END IF;
      v_tx_type := 'super_vip';
    ELSE
      IF p_property_id IS NOT NULL THEN UPDATE properties SET is_vip = TRUE, vip_expires_at = v_expires_at, vip_expiry_notified_at = NULL, updated_at = NOW() WHERE id = p_property_id AND owner_id = p_user_id;
      ELSE UPDATE services SET is_vip = TRUE, vip_expires_at = v_expires_at, vip_expiry_notified_at = NULL, updated_at = NOW() WHERE id = p_service_id AND owner_id = p_user_id; END IF;
      v_tx_type := 'vip_boost';
    END IF;
    v_description := format('%s (%s სთ)', v_pkg.name, v_duration_hours * p_quantity);
  ELSIF v_pkg.category = 'subscription' THEN
    IF v_pkg.meta ->> 'subscription_scope' = 'renter' THEN
      -- Expiry is derived from subscription records, never from listing state.
      -- A future-dated row (created by an earlier extension) MUST be counted here:
      -- filtering it out with `starts_at <= NOW()` makes every further extension
      -- restack onto the same date, so the buyer is debited for zero extra time.
      SELECT greatest(NOW(), COALESCE(max(expires_at), NOW())) INTO v_membership_start
      FROM user_subscriptions
      WHERE user_id = p_user_id AND status = 'active'
        AND expires_at > NOW();
      v_expires_at := v_membership_start + make_interval(months => v_duration_months);
      INSERT INTO user_subscriptions (user_id, package_id, starts_at, expires_at)
      VALUES (p_user_id, v_pkg.id, v_membership_start, v_expires_at);
    ELSE
      -- Security fix: an unrecognized (or absent) subscription_scope must
      -- fail closed, not fall back to an immediately-active legacy row.
      -- 'organization' is already rejected above; anything that isn't
      -- explicitly 'renter' has no reviewed activation path through this RPC.
      RAISE EXCEPTION 'ეს გამოწერის პაკეტი მიუწვდომელია' USING ERRCODE = '22023';
    END IF;
    v_tx_type := 'commission';
    v_description := format('%s (საწევრო)', v_pkg.name);
  ELSE
    v_tx_type := 'commission'; v_description := format('%s (%s)', v_pkg.name, v_pkg.category);
  END IF;

  UPDATE balances SET amount = v_new_balance, sms_remaining = v_new_sms, updated_at = NOW() WHERE user_id = p_user_id;
  INSERT INTO transactions (user_id, amount, type, description, reference_id)
  VALUES (p_user_id, -v_total_cost, v_tx_type, v_description, COALESCE(p_property_id, p_service_id, p_package_id));
  -- Renter membership is account-level and its only purchase surface is the
  -- renter overview, so that cabinet provably exists for the buyer. Everything
  -- else derives from the owned listing.
  --
  -- An SMS package deliberately falls through to NULL rather than 'renter':
  -- SMS is sold from the food and service balance pages too, and buying it does
  -- not grant the renter cabinet, so 'renter' would render nowhere while still
  -- leaving an unread badge nothing can clear. NULL at least shows in the navbar
  -- bell and /notifications.
  v_scope := CASE
    WHEN v_pkg.category = 'subscription'
      AND v_pkg.meta ->> 'subscription_scope' = 'renter' THEN 'renter'
    ELSE public.dashboard_scope_for_listing(p_property_id, p_service_id, p_user_id)
  END;

  PERFORM public._notify(p_user_id, 'payment_success', 'გადახდა წარმატებულია', format('%s გააქტიურდა.', v_pkg.name), '/dashboard', v_scope);
  IF v_pkg.category = 'vip' AND v_tier <> 'discount' THEN PERFORM public._enqueue_system_sms(p_user_id, 'vip_activation', 'MyBakuriani: თქვენი VIP გააქტიურდა.');
  ELSIF v_pkg.category = 'subscription' THEN PERFORM public._enqueue_system_sms(p_user_id, 'subscription', 'MyBakuriani: გამოწერა გააქტიურდა.'); END IF;
  RETURN json_build_object('package_id', v_pkg.id, 'category', v_pkg.category, 'cost', v_total_cost, 'new_balance', v_new_balance, 'sms_remaining', v_new_sms, 'expires_at', COALESCE(v_expires_at, v_valid_to));
END;
$function$;

-- No service can legitimately hold a NULL-expiry SUPER VIP: purchase_package
-- always writes an expiry. Clear any row created through the hole above.
UPDATE public.services
   SET is_super_vip = false
 WHERE is_super_vip IS TRUE AND vip_expires_at IS NULL;
