-- Unified purchase RPC that reads price + behavior data from pricing_packages.
-- Lets admins create new packages (or change prices of existing ones) and
-- have those changes flow through to user purchases without code changes.
--
-- Behavior by category:
--   sms          - adds (meta.sms_count * quantity) SMS to balances.sms_remaining
--   vip          - requires property; sets is_vip / is_super_vip / discount_percent
--                  based on meta.tier (super | standard | discount), extends
--                  vip_expires_at by (meta.duration_hours * quantity) hours
--   verification - deducts and logs only (no automated side effect yet)
--   ad           - deducts and logs only (no automated side effect yet)
--   subscription - deducts and logs only (no automated side effect yet)

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
