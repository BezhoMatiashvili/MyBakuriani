-- Explicit dashboard_scope for every payment_success notification.
--
-- The previous design INFERRED the cabinet inside
-- assign_notification_dashboard_scope by reading the user's most recent
-- transactions row with a non-null reference_id. That is not a fact about the
-- notification being inserted, and for wallet top-ups it is actively wrong:
-- topup_balance writes its transactions row WITHOUT a reference_id, so the
-- lookup skips it and attributes the top-up to the user's PREVIOUS listing
-- purchase. A top-up made by an owner who last boosted a rental was filed under
-- "renter"; under a food service, "food".
--
-- Every payment_success writer now passes the scope explicitly, derived from
-- data it already holds, and the inference block is deleted.

-- Mirrors dashboardScopeForPath in src/lib/notifications/scopes.ts: take the
-- segment AFTER "dashboard" (so the next-intl locale prefix is skipped) and map
-- it, including the three aliases that do not match their route name.
--
-- ONE DELIBERATE DIVERGENCE FROM THE TS HELPER: 'admin' is not mapped. The TS
-- helper reads routes and needs it; this one turns CLIENT-SUPPLIED
-- payments.return_path into a persisted scope, and no top-up surface exists
-- under /dashboard/admin. Mapping it would let any user mint an admin-scoped
-- notification for themselves by posting return_path: "/dashboard/admin".
--
-- Whitelisting is not cosmetic. An unrecognised value would violate
-- notifications_dashboard_scope_check (23514) and roll back an already-charged
-- card settlement. Anything unknown returns NULL, which is always CHECK-legal.
CREATE OR REPLACE FUNCTION public.dashboard_scope_for_path(p_path text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
RETURNS NULL ON NULL INPUT
SET search_path = ''
AS $fn$
  SELECT CASE seg
    WHEN 'guest'         THEN 'guest'
    WHEN 'renter'        THEN 'renter'
    WHEN 'seller'        THEN 'seller'
    WHEN 'food'          THEN 'food'
    WHEN 'cleaner'       THEN 'cleaner'
    WHEN 'employment'    THEN 'employment'
    WHEN 'transport'     THEN 'transport'
    WHEN 'entertainment' THEN 'entertainment'
    WHEN 'services'      THEN 'services'
    WHEN 'sms'           THEN 'renter'
    WHEN 'service'       THEN 'services'
    WHEN 'handyman'      THEN 'services'
    ELSE NULL
  END
  FROM (
    -- array_position returns NULL when "dashboard" is absent, and parts[NULL]
    -- is NULL, so a non-dashboard path yields NULL rather than erroring.
    SELECT parts[array_position(parts, 'dashboard') + 1] AS seg
    FROM (SELECT array_remove(string_to_array(p_path, '/'), '') AS parts) s
  ) t;
$fn$;

REVOKE ALL ON FUNCTION public.dashboard_scope_for_path(text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dashboard_scope_for_path(text) TO service_role;

-- Owner-scoped listing -> cabinet mapping. Mirrors
-- serviceCategoryToDashboardScope plus the is_for_sale seller/renter split.
--
-- p_owner_id is required on purpose: purchase_package only verifies ownership
-- on its 'vip' branch, so a non-VIP purchase can carry an arbitrary listing id.
-- A mismatch must fail closed to NULL, never derive a cabinet from a listing
-- the buyer does not own.
--
-- Deliberately NOT STRICT: exactly one of the two ids is normally NULL, and
-- STRICT would return NULL for every service-side call.
CREATE OR REPLACE FUNCTION public.dashboard_scope_for_listing(
  p_property_id uuid,
  p_service_id  uuid,
  p_owner_id    uuid
)
RETURNS text
LANGUAGE sql
STABLE
PARALLEL SAFE
SET search_path = public
AS $fn$
  SELECT COALESCE(
    (SELECT CASE WHEN COALESCE(p.is_for_sale, false) THEN 'seller' ELSE 'renter' END
       FROM public.properties p
      WHERE p.id = p_property_id AND p.owner_id = p_owner_id),
    (SELECT CASE s.category
              WHEN 'food'          THEN 'food'
              WHEN 'cleaning'      THEN 'cleaner'
              WHEN 'employment'    THEN 'employment'
              WHEN 'transport'     THEN 'transport'
              WHEN 'entertainment' THEN 'entertainment'
              ELSE 'services'
            END
       FROM public.services s
      WHERE s.id = p_service_id AND s.owner_id = p_owner_id)
  );
$fn$;

REVOKE ALL ON FUNCTION public.dashboard_scope_for_listing(uuid, uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dashboard_scope_for_listing(uuid, uuid, uuid)
  TO service_role;

-- topup_balance gains a scope channel. The DROP is MANDATORY and must be in
-- this migration: CREATE OR REPLACE with a 4th parameter creates a SECOND
-- OVERLOAD rather than replacing, and with the parameter defaulted every
-- existing 3-arg call then fails at runtime with
-- 42725 "function public.topup_balance(...) is not unique".
-- That is exactly the trap that bit _notify in 20260727130000.
--
-- Parameter names are reproduced byte-for-byte because PostgREST binds by name:
-- src/app/api/admin/clients/bonus/route.ts calls this with 3 named arguments
-- and must keep resolving against the new 4-arg signature.
--
-- A new signature inherits NO grants, hence the REVOKE/GRANT pair below.
DROP FUNCTION IF EXISTS public.topup_balance(uuid, numeric, text);

CREATE OR REPLACE FUNCTION public.topup_balance(
  p_user_id UUID,
  p_amount NUMERIC,
  p_description TEXT DEFAULT NULL,
  p_dashboard_scope TEXT DEFAULT NULL
)
RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_amount NUMERIC;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'არასწორი თანხა' USING ERRCODE = '22023';
  END IF;

  IF p_amount > 999999 THEN
    RAISE EXCEPTION 'თანხა აღემატება მაქსიმუმს' USING ERRCODE = '22023';
  END IF;

  -- Lock the user's balance row (create if missing)
  INSERT INTO balances (user_id, amount, sms_remaining)
  VALUES (p_user_id, 0, 0)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT amount INTO v_new_amount
  FROM balances
  WHERE user_id = p_user_id
  FOR UPDATE;

  v_new_amount := COALESCE(v_new_amount, 0) + p_amount;

  UPDATE balances
  SET amount = v_new_amount, updated_at = NOW()
  WHERE user_id = p_user_id;

  INSERT INTO transactions (user_id, amount, type, description)
  VALUES (
    p_user_id,
    p_amount,
    'topup',
    COALESCE(p_description, format('ბალანსის შევსება: %s ₾', p_amount))
  );

  PERFORM public._notify(
    p_user_id,
    'payment_success',
    'ბალანსი შეივსო',
    format('თქვენი ბალანსი შეივსო %s ₾-ით.', p_amount),
    '/dashboard',
    p_dashboard_scope
  );

  RETURN v_new_amount;
END;
$$;

REVOKE ALL ON FUNCTION public.topup_balance(uuid, numeric, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.topup_balance(uuid, numeric, text, text)
  TO service_role;

-- Body-only replace: signature unchanged, so the ACL is preserved.
CREATE OR REPLACE FUNCTION public.settle_payment(
  p_payment_id UUID,
  p_user_id UUID,
  p_approved BOOLEAN,
  p_card_brand TEXT DEFAULT NULL,
  p_card_last4 TEXT DEFAULT NULL,
  p_error TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payment payments%ROWTYPE;
  v_new_balance NUMERIC;
BEGIN
  SELECT * INTO v_payment
  FROM payments
  WHERE id = p_payment_id AND user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'გადახდა ვერ მოიძებნა' USING ERRCODE = 'P0002';
  END IF;

  -- Idempotency: only a pending payment can transition. A re-submit or page
  -- refresh after success returns the existing state WITHOUT crediting again.
  IF v_payment.status <> 'pending' THEN
    RETURN json_build_object('status', v_payment.status, 'already_processed', TRUE);
  END IF;

  IF NOT p_approved THEN
    -- Declined: keep the session pending so the user can retry another card.
    UPDATE payments
    SET last_error = p_error,
        card_brand = COALESCE(p_card_brand, card_brand),
        card_last4 = COALESCE(p_card_last4, card_last4)
    WHERE id = p_payment_id;
    RETURN json_build_object('status', 'declined');
  END IF;

  -- Approved: fulfil by purpose, then mark succeeded (same transaction).
  IF v_payment.purpose = 'topup' THEN
    -- v_payment is already the locked payments row, so return_path costs no
    -- extra query. It records the cabinet the user started the top-up from.
    -- A NULL return_path yields NULL (global) via the STRICT helper.
    v_new_balance := topup_balance(
      p_user_id,
      v_payment.amount,
      'ბალანსის შევსება (ბარათით)',
      public.dashboard_scope_for_path(v_payment.return_path)
    );
  ELSE
    RAISE EXCEPTION 'გადახდის ტიპი არ არის მხარდაჭერილი: %', v_payment.purpose
      USING ERRCODE = '22023';
  END IF;

  UPDATE payments
  SET status = 'succeeded',
      completed_at = NOW(),
      card_brand = COALESCE(p_card_brand, card_brand),
      card_last4 = COALESCE(p_card_last4, card_last4),
      last_error = NULL
  WHERE id = p_payment_id;

  RETURN json_build_object('status', 'succeeded', 'new_balance', v_new_balance);
END;
$$;

-- Body-only replace: signature unchanged, ACL preserved.
CREATE OR REPLACE FUNCTION public.purchase_vip(
  p_user_id UUID,
  p_purchase_type TEXT,
  p_property_id UUID DEFAULT NULL,
  p_days INT DEFAULT 1,
  p_service_id UUID DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cost NUMERIC;
  v_duration_hours INT;
  v_sms_count INT;
  v_description TEXT;
  v_balance NUMERIC;
  v_sms_remaining INT;
  v_total_cost NUMERIC;
  v_new_balance NUMERIC;
  v_new_sms INT;
  v_expires_at TIMESTAMPTZ;
  v_scope TEXT;
BEGIN
  IF p_days IS NULL OR p_days <= 0 OR p_days > 365 THEN
    RAISE EXCEPTION 'არასწორი დღეების რაოდენობა' USING ERRCODE = '22023';
  END IF;

  -- Resolve pricing server-side (don't trust client)
  CASE p_purchase_type
    WHEN 'vip_boost' THEN
      v_cost := 1.5; v_duration_hours := 24; v_description := 'VIP გამოკვეთა';
    WHEN 'super_vip' THEN
      v_cost := 5.0; v_duration_hours := 24; v_description := 'Super VIP';
    WHEN 'sms_package' THEN
      v_cost := 10.0; v_sms_count := 200; v_description := 'SMS პაკეტი (200 SMS)';
    WHEN 'discount_badge' THEN
      v_cost := 1.0; v_duration_hours := 24; v_description := 'ფასდაკლების ბეჯი';
    ELSE
      RAISE EXCEPTION 'არასწორი შეძენის ტიპი' USING ERRCODE = '22023';
  END CASE;

  v_total_cost := v_cost * p_days;

  -- For purchases that target a listing, require and verify ownership first.
  IF p_purchase_type IN ('vip_boost', 'super_vip', 'discount_badge') THEN
    IF p_property_id IS NOT NULL THEN
      PERFORM 1 FROM properties
      WHERE id = p_property_id AND owner_id = p_user_id;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'ობიექტი ვერ მოიძებნა ან თქვენ არ ხართ მფლობელი' USING ERRCODE = '42501';
      END IF;
    ELSIF p_service_id IS NOT NULL THEN
      PERFORM 1 FROM services
      WHERE id = p_service_id AND owner_id = p_user_id;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'სერვისი ვერ მოიძებნა ან თქვენ არ ხართ მფლობელი' USING ERRCODE = '42501';
      END IF;
    END IF;
  END IF;

  -- Lock balance row
  SELECT amount, sms_remaining INTO v_balance, v_sms_remaining
  FROM balances
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ბალანსი ვერ მოიძებნა' USING ERRCODE = 'P0002';
  END IF;

  IF v_balance < v_total_cost THEN
    RAISE EXCEPTION
      'არასაკმარისი ბალანსი. საჭიროა: % ₾, ხელმისაწვდომია: % ₾',
      v_total_cost, v_balance
    USING ERRCODE = '22023';
  END IF;

  v_new_balance := v_balance - v_total_cost;
  v_new_sms := v_sms_remaining;

  IF p_purchase_type = 'sms_package' THEN
    v_new_sms := COALESCE(v_sms_remaining, 0) + v_sms_count;
  END IF;

  UPDATE balances
  SET amount = v_new_balance,
      sms_remaining = v_new_sms,
      updated_at = NOW()
  WHERE user_id = p_user_id;

  INSERT INTO transactions (user_id, amount, type, description, reference_id)
  VALUES (
    p_user_id,
    -v_total_cost,
    p_purchase_type::transaction_type,
    format('%s (%s დღე)', v_description, p_days),
    COALESCE(p_property_id, p_service_id)
  );

  -- Apply listing-level flags atomically. The branches that set vip_expires_at
  -- also re-arm the expiry warning (vip_expiry_notified_at = NULL).
  v_expires_at := NOW() + make_interval(hours => v_duration_hours * p_days);

  IF p_property_id IS NOT NULL THEN
    IF p_purchase_type = 'vip_boost' THEN
      UPDATE properties
      SET is_vip = TRUE, vip_expires_at = v_expires_at,
          vip_expiry_notified_at = NULL, updated_at = NOW()
      WHERE id = p_property_id AND owner_id = p_user_id;
    ELSIF p_purchase_type = 'super_vip' THEN
      UPDATE properties
      SET is_super_vip = TRUE, vip_expires_at = v_expires_at,
          vip_expiry_notified_at = NULL, updated_at = NOW()
      WHERE id = p_property_id AND owner_id = p_user_id;
    ELSIF p_purchase_type = 'discount_badge' THEN
      UPDATE properties
      SET discount_percent = 10, updated_at = NOW()
      WHERE id = p_property_id AND owner_id = p_user_id;
    END IF;
  ELSIF p_service_id IS NOT NULL THEN
    IF p_purchase_type = 'vip_boost' THEN
      UPDATE services
      SET is_vip = TRUE, vip_expires_at = v_expires_at,
          vip_expiry_notified_at = NULL, updated_at = NOW()
      WHERE id = p_service_id AND owner_id = p_user_id;
    ELSIF p_purchase_type = 'super_vip' THEN
      UPDATE services
      SET is_super_vip = TRUE, vip_expires_at = v_expires_at,
          vip_expiry_notified_at = NULL, updated_at = NOW()
      WHERE id = p_service_id AND owner_id = p_user_id;
    ELSIF p_purchase_type = 'discount_badge' THEN
      UPDATE services
      SET discount_percent = 10, updated_at = NOW()
      WHERE id = p_service_id AND owner_id = p_user_id;
    END IF;
  END IF;

  -- Success notification (all purchase types). The scope comes from the owned
  -- listing; an sms_package targets none, so it stays NULL (global).
  v_scope := public.dashboard_scope_for_listing(p_property_id, p_service_id, p_user_id);

  PERFORM public._notify(
    p_user_id,
    'payment_success',
    'გადახდა წარმატებულია',
    format('%s გააქტიურდა.', v_description),
    '/dashboard',
    v_scope
  );

  -- VIP activation SMS — only when a VIP tier was applied to a real listing.
  IF p_purchase_type IN ('vip_boost', 'super_vip')
     AND (p_property_id IS NOT NULL OR p_service_id IS NOT NULL) THEN
    PERFORM public._enqueue_system_sms(
      p_user_id, 'vip_activation', 'MyBakuriani: თქვენი VIP გააქტიურდა.'
    );
  END IF;

  RETURN json_build_object(
    'purchase_type', p_purchase_type,
    'cost', v_total_cost,
    'new_balance', v_new_balance,
    'sms_remaining', v_new_sms
  );
END;
$$;

-- Body-only replace: signature unchanged, ACL preserved.
CREATE OR REPLACE FUNCTION public.purchase_package(
  p_user_id UUID,
  p_package_id UUID,
  p_property_id UUID DEFAULT NULL,
  p_service_id UUID DEFAULT NULL,
  p_quantity INT DEFAULT 1,
  p_discount_percent INT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
BEGIN
  IF p_quantity IS NULL OR p_quantity < 1 OR p_quantity > 365 THEN
    RAISE EXCEPTION 'არასწორი რაოდენობა' USING ERRCODE = '22023';
  END IF;

  SELECT id, category, code, name, amount_gel, is_enabled, meta
    INTO v_pkg
  FROM pricing_packages
  WHERE id = p_package_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'პაკეტი ვერ მოიძებნა' USING ERRCODE = 'P0002';
  END IF;
  IF NOT v_pkg.is_enabled THEN
    RAISE EXCEPTION 'პაკეტი არ არის ხელმისაწვდომი' USING ERRCODE = '22023';
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
      RAISE EXCEPTION 'VIP პაკეტისთვის აირჩიეთ ზუსტად ერთი ობიექტი' USING ERRCODE = '22023';
    END IF;
    IF p_property_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM properties WHERE id = p_property_id AND owner_id = p_user_id
    ) THEN
      RAISE EXCEPTION 'ობიექტი ვერ მოიძებნა ან თქვენ არ ხართ მფლობელი' USING ERRCODE = '42501';
    END IF;
    IF p_service_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM services WHERE id = p_service_id AND owner_id = p_user_id
    ) THEN
      RAISE EXCEPTION 'სერვისი ვერ მოიძებნა ან თქვენ არ ხართ მფლობელი' USING ERRCODE = '42501';
    END IF;
  END IF;

  INSERT INTO balances (user_id, amount, sms_remaining)
  VALUES (p_user_id, 0, 0) ON CONFLICT (user_id) DO NOTHING;
  SELECT amount, sms_remaining INTO v_balance, v_sms_remaining
  FROM balances WHERE user_id = p_user_id FOR UPDATE;
  IF v_balance < v_total_cost THEN
    RAISE EXCEPTION 'არასაკმარისი ბალანსი. საჭიროა: % ₾, ხელმისაწვდომია: % ₾',
      v_total_cost, v_balance USING ERRCODE = '22023';
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
    v_expires_at := NOW() + make_interval(hours => v_duration_hours * p_quantity);
    IF v_tier = 'discount' THEN
      IF p_discount_percent IS NULL OR p_discount_percent < 1 OR p_discount_percent > 90 THEN RAISE EXCEPTION 'არასწორი ფასდაკლების პროცენტი' USING ERRCODE = '22023'; END IF;
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
      -- Legacy fixed-date package handling remains unchanged.
      v_valid_from := NULLIF(v_pkg.meta ->> 'valid_from', '')::timestamptz;
      v_valid_to := NULLIF(v_pkg.meta ->> 'valid_to', '')::timestamptz;
      IF v_valid_to IS NOT NULL AND v_valid_to < NOW() THEN RAISE EXCEPTION 'საწევრო პაკეტის მოქმედების ვადა ამოწურულია' USING ERRCODE = '22023'; END IF;
      INSERT INTO user_subscriptions (user_id, package_id, starts_at, expires_at)
      VALUES (p_user_id, v_pkg.id, COALESCE(v_valid_from, NOW()), COALESCE(v_valid_to, NOW() + interval '30 days'));
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
  RETURN json_build_object('package_id', v_pkg.id, 'category', v_pkg.category, 'cost', v_total_cost, 'new_balance', v_new_balance, 'sms_remaining', v_new_sms, 'expires_at', CASE WHEN v_pkg.category = 'subscription' THEN COALESCE(v_expires_at, v_valid_to) ELSE NULL END);
END;
$$;

-- The payment_success inference is GONE. All three writers (topup_balance,
-- purchase_vip, purchase_package -- verified exhaustive against pg_proc.prosrc)
-- now pass an explicit scope, so the fallback could only ever mis-attribute.
--
-- There is deliberately no replacement heuristic: "the user's most recent
-- referenced transaction" is not a fact about the notification being inserted.
-- A writer that forgets the sixth _notify argument now lands NULL (global),
-- which is visible in the navbar bell and /notifications -- an honest gap
-- rather than a confident lie.
--
-- The seller branch is unchanged, and this is a body replace: the trigger keeps
-- pointing at the same oid, and the REVOKE from
-- 20260727150000_revoke_notification_scope_trigger_exec.sql is preserved.
CREATE OR REPLACE FUNCTION public.assign_notification_dashboard_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF NEW.dashboard_scope IS NOT NULL THEN RETURN NEW; END IF;

  IF NEW.type IN ('company_subscription', 'org_membership_request', 'org_membership_response', 'company_moderation')
    OR NEW.action_url LIKE '/dashboard/seller/%' THEN
    NEW.dashboard_scope := 'seller';
  END IF;

  RETURN NEW;
END;
$fn$;

NOTIFY pgrst, 'reload schema';
