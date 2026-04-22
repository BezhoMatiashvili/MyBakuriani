-- Atomic money & booking operations
--
-- Fixes race conditions in:
--   * balance top-up (double-credit)
--   * VIP / SMS / discount purchase (double-spend)
--   * booking creation (double-booking for same dates)
--
-- Strategy: serialize per-user / per-property work via advisory locks and
-- row-level locks inside SECURITY DEFINER RPCs. Edge functions invoke these
-- RPCs with the service-role client after JWT validation.
--
-- Non-destructive: only CREATEs functions and replaces the existing
-- on_booking_confirmed trigger body to stop clobbering calendar_blocks.

-- ---------------------------------------------------------------------------
-- 1. topup_balance
-- ---------------------------------------------------------------------------
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

  RETURN v_new_amount;
END;
$$;

REVOKE ALL ON FUNCTION public.topup_balance(UUID, NUMERIC, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.topup_balance(UUID, NUMERIC, TEXT) TO service_role;

-- ---------------------------------------------------------------------------
-- 2. purchase_vip
--    Handles vip_boost / super_vip / sms_package / discount_badge atomically.
--    Verifies property ownership when property_id is relevant.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.purchase_vip(
  p_user_id UUID,
  p_purchase_type TEXT,
  p_property_id UUID DEFAULT NULL,
  p_days INT DEFAULT 1
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
  v_property_exists BOOLEAN;
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

  -- For purchases that target a property, require and verify ownership first
  IF p_property_id IS NOT NULL
     AND p_purchase_type IN ('vip_boost', 'super_vip', 'discount_badge') THEN
    SELECT TRUE INTO v_property_exists
    FROM properties
    WHERE id = p_property_id AND owner_id = p_user_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'ობიექტი ვერ მოიძებნა ან თქვენ არ ხართ მფლობელი' USING ERRCODE = '42501';
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
    p_property_id
  );

  -- Apply property-level flags atomically
  IF p_property_id IS NOT NULL THEN
    v_expires_at := NOW() + make_interval(hours => v_duration_hours * p_days);

    IF p_purchase_type = 'vip_boost' THEN
      UPDATE properties
      SET is_vip = TRUE,
          vip_expires_at = v_expires_at,
          updated_at = NOW()
      WHERE id = p_property_id AND owner_id = p_user_id;
    ELSIF p_purchase_type = 'super_vip' THEN
      UPDATE properties
      SET is_super_vip = TRUE,
          vip_expires_at = v_expires_at,
          updated_at = NOW()
      WHERE id = p_property_id AND owner_id = p_user_id;
    ELSIF p_purchase_type = 'discount_badge' THEN
      UPDATE properties
      SET discount_percent = 10,
          updated_at = NOW()
      WHERE id = p_property_id AND owner_id = p_user_id;
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

REVOKE ALL ON FUNCTION public.purchase_vip(UUID, TEXT, UUID, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.purchase_vip(UUID, TEXT, UUID, INT) TO service_role;

-- ---------------------------------------------------------------------------
-- 3. create_booking
--    Atomic booking + calendar reservation. Uses per-property advisory lock
--    plus UNIQUE (property_id, date) on calendar_blocks to prevent double
--    booking under concurrency.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_booking(
  p_guest_id UUID,
  p_property_id UUID,
  p_check_in DATE,
  p_check_out DATE,
  p_guests_count INT DEFAULT 1,
  p_guest_message TEXT DEFAULT NULL
)
RETURNS bookings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_property properties%ROWTYPE;
  v_booking bookings%ROWTYPE;
  v_nights INT;
  v_conflict_count INT;
BEGIN
  IF p_check_out <= p_check_in THEN
    RAISE EXCEPTION 'არასწორი თარიღები' USING ERRCODE = '22023';
  END IF;

  IF p_check_in < CURRENT_DATE THEN
    RAISE EXCEPTION 'ჯავშნის თარიღი უნდა იყოს მომავალში' USING ERRCODE = '22023';
  END IF;

  IF p_guests_count IS NULL OR p_guests_count <= 0 THEN
    p_guests_count := 1;
  END IF;

  -- Serialize concurrent booking creates for this property
  PERFORM pg_advisory_xact_lock(hashtextextended(p_property_id::text, 0));

  SELECT * INTO v_property
  FROM properties
  WHERE id = p_property_id AND status = 'active';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ობიექტი ვერ მოიძებნა' USING ERRCODE = 'P0002';
  END IF;

  IF v_property.owner_id = p_guest_id THEN
    RAISE EXCEPTION 'საკუთარ ობიექტზე ჯავშნის გაკეთება შეუძლებელია' USING ERRCODE = '42501';
  END IF;

  v_nights := (p_check_out - p_check_in);
  IF v_nights < COALESCE(v_property.min_booking_days, 1) THEN
    RAISE EXCEPTION 'მინიმალური ჯავშანი: % ღამე', v_property.min_booking_days USING ERRCODE = '22023';
  END IF;

  -- Re-check availability under advisory lock
  SELECT COUNT(*) INTO v_conflict_count
  FROM calendar_blocks
  WHERE property_id = p_property_id
    AND date >= p_check_in
    AND date < p_check_out
    AND status IN ('booked', 'blocked');

  IF v_conflict_count > 0 THEN
    RAISE EXCEPTION 'არჩეული თარიღები დაკავებულია' USING ERRCODE = '22023';
  END IF;

  INSERT INTO bookings (
    property_id, guest_id, owner_id,
    check_in, check_out, guests_count,
    total_price, guest_message
  )
  VALUES (
    p_property_id, p_guest_id, v_property.owner_id,
    p_check_in, p_check_out, p_guests_count,
    v_nights * v_property.price_per_night, p_guest_message
  )
  RETURNING * INTO v_booking;

  -- Reserve the date range immediately. UNIQUE(property_id, date) + ON CONFLICT
  -- DO NOTHING is a belt-and-braces guard on top of the advisory lock above.
  INSERT INTO calendar_blocks (property_id, date, status, booking_id)
  SELECT p_property_id, d::date, 'booked', v_booking.id
  FROM generate_series(p_check_in, p_check_out - INTERVAL '1 day', INTERVAL '1 day') d
  ON CONFLICT (property_id, date) DO NOTHING;

  RETURN v_booking;
END;
$$;

REVOKE ALL ON FUNCTION public.create_booking(UUID, UUID, DATE, DATE, INT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_booking(UUID, UUID, DATE, DATE, INT, TEXT) TO service_role;

-- ---------------------------------------------------------------------------
-- 4. release_booking_calendar
--    Clears calendar_blocks when a booking is cancelled/rejected so the dates
--    become available again.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.release_booking_calendar(p_booking_id UUID)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted INT;
BEGIN
  WITH del AS (
    DELETE FROM calendar_blocks
    WHERE booking_id = p_booking_id
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_deleted FROM del;
  RETURN v_deleted;
END;
$$;

REVOKE ALL ON FUNCTION public.release_booking_calendar(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.release_booking_calendar(UUID) TO service_role;

-- ---------------------------------------------------------------------------
-- 5. Fix on_booking_confirmed trigger — stop clobbering existing calendar
--    blocks. Since create_booking already reserves dates, this trigger is
--    now a safety net: it only fills gaps, never overwrites.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_booking_calendar_blocks()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO calendar_blocks (property_id, date, status, booking_id)
  SELECT NEW.property_id, d::date, 'booked', NEW.id
  FROM generate_series(NEW.check_in, NEW.check_out - INTERVAL '1 day', INTERVAL '1 day') d
  ON CONFLICT (property_id, date) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
