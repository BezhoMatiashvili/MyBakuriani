-- Add an optional renter_guest_id link to the manual-booking RPCs so a manual
-- booking is attached to a CRM contact at creation/edit time. When the caller
-- passes p_renter_guest_id it is validated owner-scoped; otherwise the RPC
-- auto-resolves a contact by normalized phone. The stored FK (not phone) is what
-- the guests page reads for history.
--
-- Adding a defaulted trailing arg would create an ambiguous overload of the
-- existing 11-arg functions, so we DROP the old signatures and recreate. The
-- bodies are otherwise identical to 20260625120000_manual_booking_safe_rpcs.sql
-- (same advisory lock + calendar_blocks overlap guard).
--
-- Rollback: drop the 12-arg versions and recreate the original 11-arg versions
-- from 20260625120000_manual_booking_safe_rpcs.sql verbatim, with their grants.

DROP FUNCTION IF EXISTS public.create_manual_booking(UUID,DATE,DATE,TEXT,TEXT,TEXT,INT,NUMERIC,TEXT,TEXT,TEXT);
DROP FUNCTION IF EXISTS public.update_manual_booking(UUID,DATE,DATE,TEXT,TEXT,TEXT,INT,NUMERIC,TEXT,TEXT,TEXT);

CREATE OR REPLACE FUNCTION public.create_manual_booking(
  p_property_id    UUID,
  p_check_in       DATE,
  p_check_out      DATE,
  p_source         TEXT    DEFAULT NULL,
  p_guest_name     TEXT    DEFAULT NULL,
  p_guest_phone    TEXT    DEFAULT NULL,
  p_guests_count   INT     DEFAULT NULL,
  p_amount         NUMERIC DEFAULT NULL,
  p_note           TEXT    DEFAULT NULL,
  p_status         TEXT    DEFAULT 'manual',
  p_client_list    TEXT    DEFAULT NULL,
  p_renter_guest_id UUID   DEFAULT NULL
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
  v_guest_id UUID;
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

  -- Resolve the CRM contact to link: explicit id (validated) or phone auto-match.
  IF p_renter_guest_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM renter_guests WHERE id = p_renter_guest_id AND owner_id = v_owner
    ) THEN
      RAISE EXCEPTION 'სტუმარი ვერ მოიძებნა' USING ERRCODE = '42501';
    END IF;
    v_guest_id := p_renter_guest_id;
  ELSE
    SELECT id INTO v_guest_id
    FROM renter_guests
    WHERE owner_id = v_owner
      AND normalize_ge_phone(phone) IS NOT NULL
      AND normalize_ge_phone(phone) = normalize_ge_phone(p_guest_phone)
    LIMIT 1;
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
    guest_name, guest_phone, guests_count, amount, note, status, client_list,
    renter_guest_id
  ) VALUES (
    v_owner, p_property_id, p_check_in, p_check_out, p_source,
    p_guest_name, p_guest_phone, p_guests_count, p_amount, p_note,
    CASE WHEN p_status = 'booked' THEN 'booked' ELSE 'manual' END,
    p_client_list, v_guest_id
  )
  RETURNING * INTO v_row;

  -- Reserve each night. Under the advisory lock the only possible conflict is a
  -- leftover 'available' row (anything booked/blocked was already rejected above),
  -- so converting it is safe; the WHERE guard guarantees we never overwrite
  -- another booking's reservation.
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
  p_id             UUID,
  p_check_in       DATE,
  p_check_out      DATE,
  p_source         TEXT    DEFAULT NULL,
  p_guest_name     TEXT    DEFAULT NULL,
  p_guest_phone    TEXT    DEFAULT NULL,
  p_guests_count   INT     DEFAULT NULL,
  p_amount         NUMERIC DEFAULT NULL,
  p_note           TEXT    DEFAULT NULL,
  p_status         TEXT    DEFAULT 'manual',
  p_client_list    TEXT    DEFAULT NULL,
  p_renter_guest_id UUID   DEFAULT NULL
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
  v_guest_id UUID;
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

  IF p_renter_guest_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM renter_guests WHERE id = p_renter_guest_id AND owner_id = v_owner
    ) THEN
      RAISE EXCEPTION 'სტუმარი ვერ მოიძებნა' USING ERRCODE = '42501';
    END IF;
    v_guest_id := p_renter_guest_id;
  ELSE
    SELECT id INTO v_guest_id
    FROM renter_guests
    WHERE owner_id = v_owner
      AND normalize_ge_phone(phone) IS NOT NULL
      AND normalize_ge_phone(phone) = normalize_ge_phone(p_guest_phone)
    LIMIT 1;
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
    check_in        = p_check_in,
    check_out       = p_check_out,
    source          = p_source,
    guest_name      = p_guest_name,
    guest_phone     = p_guest_phone,
    guests_count    = p_guests_count,
    amount          = p_amount,
    note            = p_note,
    status          = CASE WHEN p_status = 'booked' THEN 'booked' ELSE 'manual' END,
    client_list     = p_client_list,
    renter_guest_id = v_guest_id
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

REVOKE ALL ON FUNCTION public.create_manual_booking(UUID,DATE,DATE,TEXT,TEXT,TEXT,INT,NUMERIC,TEXT,TEXT,TEXT,UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_manual_booking(UUID,DATE,DATE,TEXT,TEXT,TEXT,INT,NUMERIC,TEXT,TEXT,TEXT,UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.update_manual_booking(UUID,DATE,DATE,TEXT,TEXT,TEXT,INT,NUMERIC,TEXT,TEXT,TEXT,UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_manual_booking(UUID,DATE,DATE,TEXT,TEXT,TEXT,INT,NUMERIC,TEXT,TEXT,TEXT,UUID) TO authenticated;
