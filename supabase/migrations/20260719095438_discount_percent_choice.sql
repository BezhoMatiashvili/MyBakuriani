-- Let buyers choose the discount percentage instead of a hardcoded 10%.
-- purchase_package()'s 'discount' tier branch now takes p_discount_percent
-- (1-90) and writes it to properties.discount_percent, validated server-side
-- since this is the RPC's only enforcement point (client clamp is UX only).
CREATE OR REPLACE FUNCTION public.purchase_package(
  p_user_id UUID,
  p_package_id UUID,
  p_property_id UUID DEFAULT NULL,
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
      IF p_discount_percent IS NULL
         OR p_discount_percent < 1
         OR p_discount_percent > 90 THEN
        RAISE EXCEPTION 'არასწორი ფასდაკლების პროცენტი' USING ERRCODE = '22023';
      END IF;
      UPDATE properties
      SET discount_percent = p_discount_percent,
          discount_expires_at = v_expires_at,
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

  ELSIF v_pkg.category = 'subscription' THEN
    -- Subscription validity comes from the package itself (admin-set period),
    -- e.g. valid_from = 2026-01-01, valid_to = 2026-02-01. Buying grants the
    -- package's period; date-less legacy packages default to 30 days from now.
    v_valid_from := NULLIF(v_pkg.meta ->> 'valid_from', '')::timestamptz;
    v_valid_to := NULLIF(v_pkg.meta ->> 'valid_to', '')::timestamptz;

    IF v_valid_to IS NOT NULL AND v_valid_to < NOW() THEN
      RAISE EXCEPTION 'საწევრო პაკეტის მოქმედების ვადა ამოწურულია' USING ERRCODE = '22023';
    END IF;

    INSERT INTO user_subscriptions (user_id, package_id, starts_at, expires_at)
    VALUES (
      p_user_id,
      v_pkg.id,
      COALESCE(v_valid_from, NOW()),
      COALESCE(v_valid_to, NOW() + interval '30 days')
    );

    v_tx_type := 'commission';
    v_description := format('%s (საწევრო)', v_pkg.name);

  ELSE
    -- verification / ad: deduct + log only for now
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
