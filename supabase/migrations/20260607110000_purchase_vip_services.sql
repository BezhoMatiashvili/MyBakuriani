-- Extend promote (VIP / Super VIP / discount) to service listings.
--
-- Until now purchase_vip only applied flags to the `properties` table. Service
-- and food cabinets list rows from the `services` table, which had is_vip and
-- discount_percent but no is_super_vip / vip_expires_at. This migration:
--   1. Adds the two missing columns to services (additive, non-destructive).
--   2. Replaces purchase_vip with a 5-arg version that also accepts
--      p_service_id and applies the same flags to the services table.
--
-- The property path is unchanged. The edge function's existing 4-named-arg call
-- still resolves because p_service_id defaults to NULL.

-- ---------------------------------------------------------------------------
-- 1. Service VIP columns
-- ---------------------------------------------------------------------------
ALTER TABLE public.services
  ADD COLUMN IF NOT EXISTS is_super_vip BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS vip_expires_at TIMESTAMPTZ;

-- ---------------------------------------------------------------------------
-- 2. purchase_vip — now property- OR service-aware
-- ---------------------------------------------------------------------------
-- Drop the old 4-arg signature first so the new 5-arg version is unambiguous.
DROP FUNCTION IF EXISTS public.purchase_vip(UUID, TEXT, UUID, INT);

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

  -- Apply listing-level flags atomically
  v_expires_at := NOW() + make_interval(hours => v_duration_hours * p_days);

  IF p_property_id IS NOT NULL THEN
    IF p_purchase_type = 'vip_boost' THEN
      UPDATE properties
      SET is_vip = TRUE, vip_expires_at = v_expires_at, updated_at = NOW()
      WHERE id = p_property_id AND owner_id = p_user_id;
    ELSIF p_purchase_type = 'super_vip' THEN
      UPDATE properties
      SET is_super_vip = TRUE, vip_expires_at = v_expires_at, updated_at = NOW()
      WHERE id = p_property_id AND owner_id = p_user_id;
    ELSIF p_purchase_type = 'discount_badge' THEN
      UPDATE properties
      SET discount_percent = 10, updated_at = NOW()
      WHERE id = p_property_id AND owner_id = p_user_id;
    END IF;
  ELSIF p_service_id IS NOT NULL THEN
    IF p_purchase_type = 'vip_boost' THEN
      UPDATE services
      SET is_vip = TRUE, vip_expires_at = v_expires_at, updated_at = NOW()
      WHERE id = p_service_id AND owner_id = p_user_id;
    ELSIF p_purchase_type = 'super_vip' THEN
      UPDATE services
      SET is_super_vip = TRUE, vip_expires_at = v_expires_at, updated_at = NOW()
      WHERE id = p_service_id AND owner_id = p_user_id;
    ELSIF p_purchase_type = 'discount_badge' THEN
      UPDATE services
      SET discount_percent = 10, updated_at = NOW()
      WHERE id = p_service_id AND owner_id = p_user_id;
    END IF;
  END IF;

  RETURN json_build_object(
    'purchase_type', p_purchase_type,
    'cost', v_total_cost,
    'new_balance', v_new_balance,
    'sms_remaining', v_new_sms
  );
END;
$$;

-- Least-privilege: only the service_role (used by the edge function) may call it.
REVOKE ALL ON FUNCTION public.purchase_vip(UUID, TEXT, UUID, INT, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purchase_vip(UUID, TEXT, UUID, INT, UUID) TO service_role;
