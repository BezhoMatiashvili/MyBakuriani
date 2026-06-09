-- Emit in-app notifications on payment SUCCESS and transactional SMS on VIP
-- activation / subscription, by patching the three payment RPCs. These all run
-- inside the RPC transaction, so they roll back atomically with the payment if
-- anything later fails. (Payment FAILURE notifications live in the edge-fn
-- catch blocks instead — a failed RPC rolls its whole tx back, so a failure
-- notice written here would vanish.)
--
-- CREATE OR REPLACE at each function's CURRENT signature, preserving the
-- existing body + grants, adding only the notify / SMS / arming-reset calls.

-- ===========================================================================
-- 1. topup_balance(uuid, numeric, text)  — success notification
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.topup_balance(
  p_user_id UUID,
  p_amount NUMERIC,
  p_description TEXT DEFAULT NULL
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
    '/dashboard'
  );

  RETURN v_new_amount;
END;
$$;

REVOKE ALL ON FUNCTION public.topup_balance(UUID, NUMERIC, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.topup_balance(UUID, NUMERIC, TEXT) TO service_role;

-- ===========================================================================
-- 2. purchase_vip(uuid, text, uuid, int, uuid)  — success notify + VIP SMS
--    (current 5-arg version from 20260607110000_purchase_vip_services.sql)
-- ===========================================================================
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

  -- Success notification (all purchase types).
  PERFORM public._notify(
    p_user_id,
    'payment_success',
    'გადახდა წარმატებულია',
    format('%s გააქტიურდა.', v_description),
    '/dashboard'
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

REVOKE ALL ON FUNCTION public.purchase_vip(UUID, TEXT, UUID, INT, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purchase_vip(UUID, TEXT, UUID, INT, UUID) TO service_role;

-- ===========================================================================
-- 3. purchase_package(uuid, uuid, uuid, int)  — success notify + VIP /
--    subscription SMS (current version from 20260518130100_purchase_package_rpc.sql)
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.purchase_package(
  p_user_id UUID,
  p_package_id UUID,
  p_property_id UUID DEFAULT NULL,
  p_quantity INT DEFAULT 1
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
  v_tier TEXT;
  v_expires_at TIMESTAMPTZ;
  v_tx_type transaction_type;
  v_description TEXT;
BEGIN
  IF p_quantity IS NULL OR p_quantity <= 0 OR p_quantity > 365 THEN
    RAISE EXCEPTION 'არასწორი რაოდენობა' USING ERRCODE = '22023';
  END IF;

  -- Lock and read the package
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

  v_cost := v_pkg.amount_gel;
  v_total_cost := v_cost * p_quantity;

  -- For VIP purchases require + verify property ownership
  IF v_pkg.category = 'vip' THEN
    IF p_property_id IS NULL THEN
      RAISE EXCEPTION 'ობიექტი სავალდებულოა VIP-ის შესაძენად' USING ERRCODE = '22023';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM properties WHERE id = p_property_id AND owner_id = p_user_id
    ) THEN
      RAISE EXCEPTION 'ობიექტი ვერ მოიძებნა ან თქვენ არ ხართ მფლობელი' USING ERRCODE = '42501';
    END IF;
  END IF;

  -- Lock balance row (create if missing)
  INSERT INTO balances (user_id, amount, sms_remaining)
  VALUES (p_user_id, 0, 0)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT amount, sms_remaining INTO v_balance, v_sms_remaining
  FROM balances
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF v_balance < v_total_cost THEN
    RAISE EXCEPTION
      'არასაკმარისი ბალანსი. საჭიროა: % ₾, ხელმისაწვდომია: % ₾',
      v_total_cost, v_balance
    USING ERRCODE = '22023';
  END IF;

  v_new_balance := v_balance - v_total_cost;
  v_new_sms := COALESCE(v_sms_remaining, 0);

  -- Apply category-specific side effects
  IF v_pkg.category = 'sms' THEN
    v_sms_count := COALESCE((v_pkg.meta ->> 'sms_count')::int, 0);
    IF v_sms_count <= 0 THEN
      RAISE EXCEPTION 'SMS პაკეტი არასწორად არის კონფიგურირებული' USING ERRCODE = '22023';
    END IF;
    v_new_sms := v_new_sms + (v_sms_count * p_quantity);
    v_tx_type := 'sms_package';
    v_description := format('%s (%s ცალი)', v_pkg.name, p_quantity);

  ELSIF v_pkg.category = 'vip' THEN
    v_duration_hours := COALESCE((v_pkg.meta ->> 'duration_hours')::int, 24);
    v_tier := COALESCE(v_pkg.meta ->> 'tier', 'standard');
    v_expires_at := NOW() + make_interval(hours => v_duration_hours * p_quantity);

    IF v_tier = 'super' THEN
      UPDATE properties
      SET is_super_vip = TRUE,
          vip_expires_at = v_expires_at,
          vip_expiry_notified_at = NULL,
          updated_at = NOW()
      WHERE id = p_property_id AND owner_id = p_user_id;
      v_tx_type := 'super_vip';
    ELSIF v_tier = 'discount' THEN
      UPDATE properties
      SET discount_percent = COALESCE(discount_percent, 10),
          updated_at = NOW()
      WHERE id = p_property_id AND owner_id = p_user_id;
      v_tx_type := 'discount_badge';
    ELSE
      UPDATE properties
      SET is_vip = TRUE,
          vip_expires_at = v_expires_at,
          vip_expiry_notified_at = NULL,
          updated_at = NOW()
      WHERE id = p_property_id AND owner_id = p_user_id;
      v_tx_type := 'vip_boost';
    END IF;

    v_description := format('%s (%s)', v_pkg.name,
      CASE WHEN p_quantity = 1
        THEN format('%s სთ', v_duration_hours)
        ELSE format('%s × %s სთ', p_quantity, v_duration_hours)
      END);

  ELSE
    -- verification / ad / subscription: deduct + log only for now
    v_tx_type := 'commission';
    v_description := format('%s (%s)', v_pkg.name, v_pkg.category);
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
    v_tx_type,
    v_description,
    COALESCE(p_property_id, p_package_id)
  );

  -- Success notification (all categories).
  PERFORM public._notify(
    p_user_id,
    'payment_success',
    'გადახდა წარმატებულია',
    format('%s გააქტიურდა.', v_pkg.name),
    '/dashboard'
  );

  -- Transactional SMS: VIP activation (non-discount tiers) or subscription.
  IF v_pkg.category = 'vip' AND v_tier <> 'discount' THEN
    PERFORM public._enqueue_system_sms(
      p_user_id, 'vip_activation', 'MyBakuriani: თქვენი VIP გააქტიურდა.'
    );
  ELSIF v_pkg.category = 'subscription' THEN
    PERFORM public._enqueue_system_sms(
      p_user_id, 'subscription', 'MyBakuriani: გამოწერა გააქტიურდა.'
    );
  END IF;

  RETURN json_build_object(
    'package_id', v_pkg.id,
    'category', v_pkg.category,
    'cost', v_total_cost,
    'new_balance', v_new_balance,
    'sms_remaining', v_new_sms
  );
END;
$$;

REVOKE ALL ON FUNCTION public.purchase_package(UUID, UUID, UUID, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.purchase_package(UUID, UUID, UUID, INT) TO service_role;
