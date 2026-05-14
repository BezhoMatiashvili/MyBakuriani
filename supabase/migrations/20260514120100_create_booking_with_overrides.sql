-- Replace create_booking so it sums per-day prices using price_overrides,
-- falling back to properties.price_per_night for days without an override.

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
  v_total_price NUMERIC(12,2);
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

  SELECT COUNT(*) INTO v_conflict_count
  FROM calendar_blocks
  WHERE property_id = p_property_id
    AND date >= p_check_in
    AND date < p_check_out
    AND status IN ('booked', 'blocked');

  IF v_conflict_count > 0 THEN
    RAISE EXCEPTION 'არჩეული თარიღები დაკავებულია' USING ERRCODE = '22023';
  END IF;

  -- Per-day price sum: use override when present, else base price_per_night.
  SELECT COALESCE(SUM(COALESCE(po.price, v_property.price_per_night)), 0)
    INTO v_total_price
  FROM generate_series(p_check_in, p_check_out - INTERVAL '1 day', INTERVAL '1 day') AS d
  LEFT JOIN price_overrides po
    ON po.property_id = p_property_id
    AND po.date = d::date;

  INSERT INTO bookings (
    property_id, guest_id, owner_id,
    check_in, check_out, guests_count,
    total_price, guest_message
  )
  VALUES (
    p_property_id, p_guest_id, v_property.owner_id,
    p_check_in, p_check_out, p_guests_count,
    v_total_price, p_guest_message
  )
  RETURNING * INTO v_booking;

  INSERT INTO calendar_blocks (property_id, date, status, booking_id)
  SELECT p_property_id, d::date, 'booked', v_booking.id
  FROM generate_series(p_check_in, p_check_out - INTERVAL '1 day', INTERVAL '1 day') d
  ON CONFLICT (property_id, date) DO NOTHING;

  RETURN v_booking;
END;
$$;

REVOKE ALL ON FUNCTION public.create_booking(UUID, UUID, DATE, DATE, INT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_booking(UUID, UUID, DATE, DATE, INT, TEXT) TO service_role;
