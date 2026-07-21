-- Keep the renter CRM as a projection of named stays.  calendar_blocks remain
-- the availability projection: anonymous owner blocks never reach this code.

-- Resolve a CRM contact only within one owner. Profile identity is strongest;
-- a normalized phone is the fallback. Names are deliberately never matched.
CREATE OR REPLACE FUNCTION public.ensure_renter_guest(
  p_owner_id UUID,
  p_name TEXT,
  p_phone TEXT DEFAULT NULL,
  p_profile_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_guest_id UUID;
  v_name TEXT := NULLIF(btrim(p_name), '');
BEGIN
  IF p_owner_id IS NULL OR v_name IS NULL THEN
    RAISE EXCEPTION 'სტუმრის სახელი აუცილებელია' USING ERRCODE = '22023';
  END IF;

  IF p_profile_id IS NOT NULL THEN
    SELECT id INTO v_guest_id
    FROM renter_guests
    WHERE owner_id = p_owner_id AND profile_id = p_profile_id
    ORDER BY created_at, id
    LIMIT 1;
  END IF;

  IF v_guest_id IS NULL AND normalize_ge_phone(p_phone) IS NOT NULL THEN
    SELECT id INTO v_guest_id
    FROM renter_guests
    WHERE owner_id = p_owner_id
      AND normalize_ge_phone(phone) = normalize_ge_phone(p_phone)
    ORDER BY created_at, id
    LIMIT 1;
  END IF;

  IF v_guest_id IS NULL THEN
    INSERT INTO renter_guests (owner_id, name, phone, profile_id)
    VALUES (p_owner_id, v_name, NULLIF(btrim(p_phone), ''), p_profile_id)
    RETURNING id INTO v_guest_id;
  ELSIF p_profile_id IS NOT NULL THEN
    -- A phone match from older CRM data becomes an explicit platform link.
    -- Do not overwrite a different already-linked account.
    UPDATE renter_guests
    SET profile_id = p_profile_id
    WHERE id = v_guest_id AND profile_id IS NULL;
  END IF;

  RETURN v_guest_id;
END;
$$;

-- An explicit platform identity must win over the older phone-derived helper.
-- In particular, platform accounts without a phone still need a durable link.
CREATE OR REPLACE FUNCTION public.renter_guests_resolve_profile()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.profile_id IS NULL AND normalize_ge_phone(NEW.phone) IS NOT NULL THEN
    SELECT id INTO NEW.profile_id
    FROM profiles
    WHERE normalize_ge_phone(phone) = normalize_ge_phone(NEW.phone)
    LIMIT 1;
  END IF;
  RETURN NEW;
END;
$$;

-- Recreate the public manual-booking RPCs. A named booking always has a CRM
-- contact, both boundary dates are occupied, and a same-day stay is valid.
DROP FUNCTION IF EXISTS public.create_manual_booking(UUID,DATE,DATE,TEXT,TEXT,TEXT,INT,NUMERIC,TEXT,TEXT,TEXT,UUID);
DROP FUNCTION IF EXISTS public.update_manual_booking(UUID,DATE,DATE,TEXT,TEXT,TEXT,INT,NUMERIC,TEXT,TEXT,TEXT,UUID);

CREATE OR REPLACE FUNCTION public.create_manual_booking(
  p_property_id UUID, p_check_in DATE, p_check_out DATE,
  p_source TEXT DEFAULT NULL, p_guest_name TEXT DEFAULT NULL,
  p_guest_phone TEXT DEFAULT NULL, p_guests_count INT DEFAULT NULL,
  p_amount NUMERIC DEFAULT NULL, p_note TEXT DEFAULT NULL,
  p_status TEXT DEFAULT 'manual', p_client_list TEXT DEFAULT NULL,
  p_renter_guest_id UUID DEFAULT NULL
)
RETURNS manual_bookings
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_owner UUID := auth.uid(); v_row manual_bookings%ROWTYPE;
  v_guest_id UUID; v_conflict INT;
BEGIN
  IF v_owner IS NULL THEN RAISE EXCEPTION 'ავტორიზაცია საჭიროა' USING ERRCODE = '42501'; END IF;
  IF p_check_out < p_check_in THEN RAISE EXCEPTION 'არასწორი თარიღები' USING ERRCODE = '22023'; END IF;
  IF NOT EXISTS (SELECT 1 FROM properties WHERE id = p_property_id AND owner_id = v_owner) THEN
    RAISE EXCEPTION 'ობიექტი ვერ მოიძებნა ან თქვენ არ ხართ მფლობელი' USING ERRCODE = '42501';
  END IF;

  IF p_renter_guest_id IS NOT NULL THEN
    SELECT id INTO v_guest_id FROM renter_guests WHERE id = p_renter_guest_id AND owner_id = v_owner;
    IF v_guest_id IS NULL THEN RAISE EXCEPTION 'სტუმარი ვერ მოიძებნა' USING ERRCODE = '42501'; END IF;
  ELSE
    v_guest_id := ensure_renter_guest(v_owner, p_guest_name, p_guest_phone);
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_property_id::text, 0));
  SELECT count(*) INTO v_conflict FROM calendar_blocks
  WHERE property_id = p_property_id AND date BETWEEN p_check_in AND p_check_out
    AND status IN ('booked', 'blocked');
  IF v_conflict > 0 THEN RAISE EXCEPTION 'არჩეული თარიღები დაკავებულია' USING ERRCODE = '22023'; END IF;

  INSERT INTO manual_bookings (owner_id, property_id, check_in, check_out, source,
    guest_name, guest_phone, guests_count, amount, note, status, client_list, renter_guest_id)
  VALUES (v_owner, p_property_id, p_check_in, p_check_out, p_source, NULLIF(btrim(p_guest_name), ''),
    NULLIF(btrim(p_guest_phone), ''), p_guests_count, p_amount, p_note,
    CASE WHEN p_status = 'booked' THEN 'booked' ELSE 'manual' END, p_client_list, v_guest_id)
  RETURNING * INTO v_row;

  INSERT INTO calendar_blocks (property_id, date, status, booking_id)
  SELECT p_property_id, d::date, 'booked', v_row.id
  FROM generate_series(p_check_in, p_check_out, INTERVAL '1 day') d
  ON CONFLICT (property_id, date) DO UPDATE SET status = 'booked', booking_id = v_row.id
    WHERE calendar_blocks.status = 'available';
  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_manual_booking(
  p_id UUID, p_check_in DATE, p_check_out DATE,
  p_source TEXT DEFAULT NULL, p_guest_name TEXT DEFAULT NULL,
  p_guest_phone TEXT DEFAULT NULL, p_guests_count INT DEFAULT NULL,
  p_amount NUMERIC DEFAULT NULL, p_note TEXT DEFAULT NULL,
  p_status TEXT DEFAULT 'manual', p_client_list TEXT DEFAULT NULL,
  p_renter_guest_id UUID DEFAULT NULL
)
RETURNS manual_bookings
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_owner UUID := auth.uid(); v_existing manual_bookings%ROWTYPE;
  v_row manual_bookings%ROWTYPE; v_guest_id UUID; v_conflict INT;
BEGIN
  IF v_owner IS NULL THEN RAISE EXCEPTION 'ავტორიზაცია საჭიროა' USING ERRCODE = '42501'; END IF;
  IF p_check_out < p_check_in THEN RAISE EXCEPTION 'არასწორი თარიღები' USING ERRCODE = '22023'; END IF;
  SELECT * INTO v_existing FROM manual_bookings WHERE id = p_id AND owner_id = v_owner;
  IF NOT FOUND THEN RAISE EXCEPTION 'ჯავშანი ვერ მოიძებნა' USING ERRCODE = 'P0002'; END IF;

  -- Editing does not silently detach a prior CRM relationship.
  IF p_renter_guest_id IS NOT NULL THEN
    SELECT id INTO v_guest_id FROM renter_guests WHERE id = p_renter_guest_id AND owner_id = v_owner;
    IF v_guest_id IS NULL THEN RAISE EXCEPTION 'სტუმარი ვერ მოიძებნა' USING ERRCODE = '42501'; END IF;
  ELSIF v_existing.renter_guest_id IS NOT NULL THEN
    v_guest_id := v_existing.renter_guest_id;
  ELSE
    v_guest_id := ensure_renter_guest(v_owner, p_guest_name, p_guest_phone);
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(v_existing.property_id::text, 0));
  SELECT count(*) INTO v_conflict FROM calendar_blocks
  WHERE property_id = v_existing.property_id AND date BETWEEN p_check_in AND p_check_out
    AND status IN ('booked', 'blocked') AND booking_id IS DISTINCT FROM p_id;
  IF v_conflict > 0 THEN RAISE EXCEPTION 'არჩეული თარიღები დაკავებულია' USING ERRCODE = '22023'; END IF;

  DELETE FROM calendar_blocks WHERE booking_id = p_id;
  UPDATE manual_bookings SET check_in = p_check_in, check_out = p_check_out, source = p_source,
    guest_name = NULLIF(btrim(p_guest_name), ''), guest_phone = NULLIF(btrim(p_guest_phone), ''),
    guests_count = p_guests_count, amount = p_amount, note = p_note,
    status = CASE WHEN p_status = 'booked' THEN 'booked' ELSE 'manual' END,
    client_list = p_client_list, renter_guest_id = v_guest_id
  WHERE id = p_id AND owner_id = v_owner RETURNING * INTO v_row;
  INSERT INTO calendar_blocks (property_id, date, status, booking_id)
  SELECT v_existing.property_id, d::date, 'booked', p_id
  FROM generate_series(p_check_in, p_check_out, INTERVAL '1 day') d
  ON CONFLICT (property_id, date) DO UPDATE SET status = 'booked', booking_id = p_id
    WHERE calendar_blocks.status = 'available';
  RETURN v_row;
END;
$$;

-- Used by the guests page when one form creates a contact and its first stay.
-- Calling the booking RPC inside this transaction makes overlap failures roll
-- back the newly-created contact as well.
CREATE OR REPLACE FUNCTION public.create_guest_manual_booking(
  p_property_id UUID, p_check_in DATE, p_check_out DATE, p_name TEXT,
  p_phone TEXT DEFAULT NULL, p_note TEXT DEFAULT NULL
)
RETURNS manual_bookings
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_guest_id UUID; v_owner UUID := auth.uid(); v_booking manual_bookings;
BEGIN
  IF v_owner IS NULL THEN RAISE EXCEPTION 'ავტორიზაცია საჭიროა' USING ERRCODE = '42501'; END IF;
  v_guest_id := ensure_renter_guest(v_owner, p_name, p_phone);
  SELECT * INTO v_booking FROM create_manual_booking(
    p_property_id, p_check_in, p_check_out, NULL, p_name, p_phone, NULL,
    NULL, p_note, 'manual', NULL, v_guest_id
  );
  UPDATE renter_guests SET visit_dates = NULL WHERE id = v_guest_id;
  RETURN v_booking;
END;
$$;

-- Cancelling a manual booking is one DELETE from the client and remains atomic.
CREATE OR REPLACE FUNCTION public.delete_manual_booking_calendar_blocks()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  DELETE FROM calendar_blocks WHERE booking_id = OLD.id;
  RETURN OLD;
END;
$$;
DROP TRIGGER IF EXISTS trg_manual_booking_release_calendar ON manual_bookings;
CREATE TRIGGER trg_manual_booking_release_calendar
  BEFORE DELETE ON manual_bookings FOR EACH ROW
  EXECUTE FUNCTION public.delete_manual_booking_calendar_blocks();

-- Platform bookings create (or join) their owner-scoped CRM contact. This is
-- also used for a safe, repeatable backfill; no name-only merges occur.
CREATE OR REPLACE FUNCTION public.sync_platform_booking_guest()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_name TEXT; v_phone TEXT;
BEGIN
  SELECT NULLIF(btrim(display_name), ''), phone INTO v_name, v_phone
  FROM profiles WHERE id = NEW.guest_id;
  PERFORM ensure_renter_guest(NEW.owner_id, COALESCE(v_name, 'სტუმარი'), v_phone, NEW.guest_id);
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_bookings_sync_renter_guest ON bookings;
CREATE TRIGGER trg_bookings_sync_renter_guest
  AFTER INSERT OR UPDATE OF guest_id, owner_id ON bookings FOR EACH ROW
  EXECUTE FUNCTION public.sync_platform_booking_guest();

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT b.owner_id, b.guest_id, p.display_name, p.phone
    FROM bookings b JOIN profiles p ON p.id = b.guest_id
  LOOP
    PERFORM ensure_renter_guest(r.owner_id, COALESCE(NULLIF(btrim(r.display_name), ''), 'სტუმარი'), r.phone, r.guest_id);
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_renter_guest(UUID,TEXT,TEXT,UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_guest_manual_booking(UUID,DATE,DATE,TEXT,TEXT,TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_manual_booking(UUID,DATE,DATE,TEXT,TEXT,TEXT,INT,NUMERIC,TEXT,TEXT,TEXT,UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_manual_booking(UUID,DATE,DATE,TEXT,TEXT,TEXT,INT,NUMERIC,TEXT,TEXT,TEXT,UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_manual_booking(UUID,DATE,DATE,TEXT,TEXT,TEXT,INT,NUMERIC,TEXT,TEXT,TEXT,UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_manual_booking(UUID,DATE,DATE,TEXT,TEXT,TEXT,INT,NUMERIC,TEXT,TEXT,TEXT,UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_guest_manual_booking(UUID,DATE,DATE,TEXT,TEXT,TEXT) TO authenticated;
