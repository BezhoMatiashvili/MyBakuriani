-- Atomic, overlap-safe manual booking create/update callable by an authenticated owner.
-- Mirrors create_booking's per-property advisory lock + calendar_blocks conflict pre-check so
-- manual and guest creates serialize against EACH OTHER and can never double-book a property's
-- date range. Property-level exclusivity (one property = one bookable unit).
--
-- Why these exist: manual bookings were created client-side with a raw INSERT (no overlap check)
-- followed by a calendar_blocks UPSERT that silently clobbered any existing reservation. These
-- RPCs move that logic server-side under the same advisory lock as create_booking.
--
-- Rollback:
--   DROP FUNCTION IF EXISTS public.create_manual_booking(UUID,DATE,DATE,TEXT,TEXT,TEXT,INT,NUMERIC,TEXT,TEXT,TEXT);
--   DROP FUNCTION IF EXISTS public.update_manual_booking(UUID,DATE,DATE,TEXT,TEXT,TEXT,INT,NUMERIC,TEXT,TEXT,TEXT);

CREATE OR REPLACE FUNCTION public.create_manual_booking(
  p_property_id  UUID,
  p_check_in     DATE,
  p_check_out    DATE,
  p_source       TEXT    DEFAULT NULL,
  p_guest_name   TEXT    DEFAULT NULL,
  p_guest_phone  TEXT    DEFAULT NULL,
  p_guests_count INT     DEFAULT NULL,
  p_amount       NUMERIC DEFAULT NULL,
  p_note         TEXT    DEFAULT NULL,
  p_status       TEXT    DEFAULT 'manual',
  p_client_list  TEXT    DEFAULT NULL
)
RETURNS manual_bookings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner    UUID := auth.uid();
  v_row      manual_bookings%ROWTYPE;
  v_conflict INT;
BEGIN
  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'ავტორიზაცია საჭიროა' USING ERRCODE = '42501';
  END IF;
  IF p_check_out <= p_check_in THEN
    RAISE EXCEPTION 'არასწორი თარიღები' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM properties WHERE id = p_property_id AND owner_id = v_owner
  ) THEN
    RAISE EXCEPTION 'ობიექტი ვერ მოიძებნა ან თქვენ არ ხართ მფლობელი' USING ERRCODE = '42501';
  END IF;

  -- Serialize against guest create_booking AND other manual creates on this property.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_property_id::text, 0));

  SELECT COUNT(*) INTO v_conflict
  FROM calendar_blocks
  WHERE property_id = p_property_id
    AND date >= p_check_in
    AND date <  p_check_out
    AND status IN ('booked', 'blocked');

  IF v_conflict > 0 THEN
    RAISE EXCEPTION 'არჩეული თარიღები დაკავებულია' USING ERRCODE = '22023';
  END IF;

  INSERT INTO manual_bookings (
    owner_id, property_id, check_in, check_out, source,
    guest_name, guest_phone, guests_count, amount, note, status, client_list
  ) VALUES (
    v_owner, p_property_id, p_check_in, p_check_out, p_source,
    p_guest_name, p_guest_phone, p_guests_count, p_amount, p_note,
    CASE WHEN p_status = 'booked' THEN 'booked' ELSE 'manual' END,
    p_client_list
  )
  RETURNING * INTO v_row;

  -- Reserve each night. Under the advisory lock the only possible conflict is a leftover
  -- 'available' row (anything booked/blocked was already rejected above), so converting it is
  -- safe; the WHERE guard guarantees we never overwrite another booking's reservation.
  INSERT INTO calendar_blocks (property_id, date, status, booking_id)
  SELECT p_property_id, d::date, 'booked', v_row.id
  FROM generate_series(p_check_in, p_check_out - INTERVAL '1 day', INTERVAL '1 day') d
  ON CONFLICT (property_id, date) DO UPDATE
    SET status = 'booked', booking_id = v_row.id
    WHERE calendar_blocks.status = 'available';

  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_manual_booking(
  p_id           UUID,
  p_check_in     DATE,
  p_check_out    DATE,
  p_source       TEXT    DEFAULT NULL,
  p_guest_name   TEXT    DEFAULT NULL,
  p_guest_phone  TEXT    DEFAULT NULL,
  p_guests_count INT     DEFAULT NULL,
  p_amount       NUMERIC DEFAULT NULL,
  p_note         TEXT    DEFAULT NULL,
  p_status       TEXT    DEFAULT 'manual',
  p_client_list  TEXT    DEFAULT NULL
)
RETURNS manual_bookings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner    UUID := auth.uid();
  v_existing manual_bookings%ROWTYPE;
  v_row      manual_bookings%ROWTYPE;
  v_conflict INT;
BEGIN
  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'ავტორიზაცია საჭიროა' USING ERRCODE = '42501';
  END IF;
  IF p_check_out <= p_check_in THEN
    RAISE EXCEPTION 'არასწორი თარიღები' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_existing
  FROM manual_bookings
  WHERE id = p_id AND owner_id = v_owner;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ჯავშანი ვერ მოიძებნა' USING ERRCODE = 'P0002';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(v_existing.property_id::text, 0));

  -- Conflict-check the NEW range, ignoring this booking's own nights.
  SELECT COUNT(*) INTO v_conflict
  FROM calendar_blocks
  WHERE property_id = v_existing.property_id
    AND date >= p_check_in
    AND date <  p_check_out
    AND status IN ('booked', 'blocked')
    AND booking_id IS DISTINCT FROM p_id;

  IF v_conflict > 0 THEN
    RAISE EXCEPTION 'არჩეული თარიღები დაკავებულია' USING ERRCODE = '22023';
  END IF;

  -- Free this booking's old nights, then update the row and re-reserve the new range.
  DELETE FROM calendar_blocks WHERE booking_id = p_id;

  UPDATE manual_bookings SET
    check_in     = p_check_in,
    check_out    = p_check_out,
    source       = p_source,
    guest_name   = p_guest_name,
    guest_phone  = p_guest_phone,
    guests_count = p_guests_count,
    amount       = p_amount,
    note         = p_note,
    status       = CASE WHEN p_status = 'booked' THEN 'booked' ELSE 'manual' END,
    client_list  = p_client_list
  WHERE id = p_id AND owner_id = v_owner
  RETURNING * INTO v_row;

  INSERT INTO calendar_blocks (property_id, date, status, booking_id)
  SELECT v_existing.property_id, d::date, 'booked', p_id
  FROM generate_series(p_check_in, p_check_out - INTERVAL '1 day', INTERVAL '1 day') d
  ON CONFLICT (property_id, date) DO UPDATE
    SET status = 'booked', booking_id = p_id
    WHERE calendar_blocks.status = 'available';

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.create_manual_booking(UUID,DATE,DATE,TEXT,TEXT,TEXT,INT,NUMERIC,TEXT,TEXT,TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_manual_booking(UUID,DATE,DATE,TEXT,TEXT,TEXT,INT,NUMERIC,TEXT,TEXT,TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.update_manual_booking(UUID,DATE,DATE,TEXT,TEXT,TEXT,INT,NUMERIC,TEXT,TEXT,TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_manual_booking(UUID,DATE,DATE,TEXT,TEXT,TEXT,INT,NUMERIC,TEXT,TEXT,TEXT) TO authenticated;
