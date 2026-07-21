-- Package-backed promotions can target either an owned property or an owned
-- service. Replace the former property-only overload so PostgREST has one
-- unambiguous RPC signature.
DROP FUNCTION IF EXISTS public.purchase_package(uuid, uuid, uuid, integer, integer);
DROP FUNCTION IF EXISTS public.purchase_package(uuid, uuid, uuid, uuid, integer, integer);

CREATE FUNCTION public.purchase_package(
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
  v_tier TEXT;
  v_expires_at TIMESTAMPTZ;
  v_valid_from TIMESTAMPTZ;
  v_valid_to TIMESTAMPTZ;
  v_tx_type transaction_type;
  v_description TEXT;
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

  v_cost := v_pkg.amount_gel;
  v_total_cost := v_cost * p_quantity;

  -- Only VIP packages modify a listing, and they must have exactly one target.
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
  VALUES (p_user_id, 0, 0)
  ON CONFLICT (user_id) DO NOTHING;

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
    IF v_sms_count <= 0 THEN
      RAISE EXCEPTION 'SMS პაკეტი არასწორად არის კონფიგურირებული' USING ERRCODE = '22023';
    END IF;
    v_new_sms := v_new_sms + v_sms_count * p_quantity;
    v_tx_type := 'sms_package';
    v_description := format('%s (%s ცალი)', v_pkg.name, p_quantity);

  ELSIF v_pkg.category = 'vip' THEN
    v_duration_hours := COALESCE((v_pkg.meta ->> 'duration_hours')::int, 24);
    v_tier := COALESCE(v_pkg.meta ->> 'tier', 'standard');
    v_expires_at := NOW() + make_interval(hours => v_duration_hours * p_quantity);

    IF v_tier = 'discount' THEN
      IF p_discount_percent IS NULL OR p_discount_percent < 1 OR p_discount_percent > 90 THEN
        RAISE EXCEPTION 'არასწორი ფასდაკლების პროცენტი' USING ERRCODE = '22023';
      END IF;
      IF p_property_id IS NOT NULL THEN
        UPDATE properties SET discount_percent = p_discount_percent,
          discount_expires_at = v_expires_at, updated_at = NOW()
        WHERE id = p_property_id AND owner_id = p_user_id;
      ELSE
        UPDATE services SET discount_percent = p_discount_percent,
          discount_expires_at = v_expires_at, updated_at = NOW()
        WHERE id = p_service_id AND owner_id = p_user_id;
      END IF;
      v_tx_type := 'discount_badge';
    ELSIF v_tier = 'super' THEN
      IF p_property_id IS NOT NULL THEN
        UPDATE properties SET is_super_vip = TRUE, vip_expires_at = v_expires_at,
          vip_expiry_notified_at = NULL, updated_at = NOW()
        WHERE id = p_property_id AND owner_id = p_user_id;
      ELSE
        UPDATE services SET is_super_vip = TRUE, vip_expires_at = v_expires_at,
          vip_expiry_notified_at = NULL, updated_at = NOW()
        WHERE id = p_service_id AND owner_id = p_user_id;
      END IF;
      v_tx_type := 'super_vip';
    ELSE
      IF p_property_id IS NOT NULL THEN
        UPDATE properties SET is_vip = TRUE, vip_expires_at = v_expires_at,
          vip_expiry_notified_at = NULL, updated_at = NOW()
        WHERE id = p_property_id AND owner_id = p_user_id;
      ELSE
        UPDATE services SET is_vip = TRUE, vip_expires_at = v_expires_at,
          vip_expiry_notified_at = NULL, updated_at = NOW()
        WHERE id = p_service_id AND owner_id = p_user_id;
      END IF;
      v_tx_type := 'vip_boost';
    END IF;
    v_description := format('%s (%s სთ)', v_pkg.name, v_duration_hours * p_quantity);

  ELSIF v_pkg.category = 'subscription' THEN
    v_valid_from := NULLIF(v_pkg.meta ->> 'valid_from', '')::timestamptz;
    v_valid_to := NULLIF(v_pkg.meta ->> 'valid_to', '')::timestamptz;
    IF v_valid_to IS NOT NULL AND v_valid_to < NOW() THEN
      RAISE EXCEPTION 'საწევრო პაკეტის მოქმედების ვადა ამოწურულია' USING ERRCODE = '22023';
    END IF;
    INSERT INTO user_subscriptions (user_id, package_id, starts_at, expires_at)
    VALUES (p_user_id, v_pkg.id, COALESCE(v_valid_from, NOW()),
      COALESCE(v_valid_to, NOW() + interval '30 days'));
    v_tx_type := 'commission';
    v_description := format('%s (საწევრო)', v_pkg.name);
  ELSE
    v_tx_type := 'commission';
    v_description := format('%s (%s)', v_pkg.name, v_pkg.category);
  END IF;

  UPDATE balances SET amount = v_new_balance, sms_remaining = v_new_sms, updated_at = NOW()
  WHERE user_id = p_user_id;
  INSERT INTO transactions (user_id, amount, type, description, reference_id)
  VALUES (p_user_id, -v_total_cost, v_tx_type, v_description,
    COALESCE(p_property_id, p_service_id, p_package_id));

  PERFORM public._notify(p_user_id, 'payment_success', 'გადახდა წარმატებულია',
    format('%s გააქტიურდა.', v_pkg.name), '/dashboard');
  IF v_pkg.category = 'vip' AND v_tier <> 'discount' THEN
    PERFORM public._enqueue_system_sms(p_user_id, 'vip_activation',
      'MyBakuriani: თქვენი VIP გააქტიურდა.');
  ELSIF v_pkg.category = 'subscription' THEN
    PERFORM public._enqueue_system_sms(p_user_id, 'subscription',
      'MyBakuriani: გამოწერა გააქტიურდა.');
  END IF;

  RETURN json_build_object('package_id', v_pkg.id, 'category', v_pkg.category,
    'cost', v_total_cost, 'new_balance', v_new_balance, 'sms_remaining', v_new_sms);
END;
$$;

REVOKE ALL ON FUNCTION public.purchase_package(uuid, uuid, uuid, uuid, integer, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purchase_package(uuid, uuid, uuid, uuid, integer, integer)
  TO service_role;
