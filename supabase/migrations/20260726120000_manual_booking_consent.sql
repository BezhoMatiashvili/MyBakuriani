-- SMS automation module, migration C of D: manual-booking consent. See sms.md P3.
--
-- Lets the host record owner-attested marketing consent (D5) when entering an offline
-- booking, without breaking offline booking creation.
--
-- ALL THREE BODIES ARE COPIED VERBATIM FROM 20260721160000_sync_renter_guest_bookings.sql
-- (the current live definitions). Do NOT copy from 20260625120000_manual_booking_safe_rpcs.sql
-- or 20260628150100_manual_booking_link_param.sql - both are superseded and copying them
-- silently drops the renter-guest sync logic.
--
-- Why DROP first: CREATE OR REPLACE only replaces an IDENTICAL signature. Adding a 13th
-- parameter would mint a SECOND overload, and every named-argument call site would then be
-- ambiguous. Grants attach to the signature, so the REVOKE/GRANT block at the end is a
-- re-application, not a duplicate (it mirrors 20260721160000:249-255 - note :250, the
-- create_guest_manual_booking REVOKE, which is easy to miss).
--
-- The migration MUST end with `notify pgrst, 'reload schema';` - PostgREST caches the
-- function catalogue and would otherwise return PGRST202, breaking ALL offline booking
-- creation.

DROP FUNCTION IF EXISTS public.create_manual_booking(UUID,DATE,DATE,TEXT,TEXT,TEXT,INT,NUMERIC,TEXT,TEXT,TEXT,UUID);
DROP FUNCTION IF EXISTS public.update_manual_booking(UUID,DATE,DATE,TEXT,TEXT,TEXT,INT,NUMERIC,TEXT,TEXT,TEXT,UUID);
DROP FUNCTION IF EXISTS public.create_guest_manual_booking(UUID,DATE,DATE,TEXT,TEXT,TEXT);

CREATE OR REPLACE FUNCTION public.create_manual_booking(
  p_property_id UUID, p_check_in DATE, p_check_out DATE,
  p_source TEXT DEFAULT NULL, p_guest_name TEXT DEFAULT NULL,
  p_guest_phone TEXT DEFAULT NULL, p_guests_count INT DEFAULT NULL,
  p_amount NUMERIC DEFAULT NULL, p_note TEXT DEFAULT NULL,
  p_status TEXT DEFAULT 'manual', p_client_list TEXT DEFAULT NULL,
  p_renter_guest_id UUID DEFAULT NULL,
  p_marketing_consent BOOLEAN DEFAULT FALSE
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
    guest_name, guest_phone, guests_count, amount, note, status, client_list, renter_guest_id,
    marketing_consent, marketing_consent_at)
  VALUES (v_owner, p_property_id, p_check_in, p_check_out, p_source, NULLIF(btrim(p_guest_name), ''),
    NULLIF(btrim(p_guest_phone), ''), p_guests_count, p_amount, p_note,
    CASE WHEN p_status = 'booked' THEN 'booked' ELSE 'manual' END, p_client_list, v_guest_id,
    COALESCE(p_marketing_consent, FALSE),
    CASE WHEN COALESCE(p_marketing_consent, FALSE) THEN now() ELSE NULL END)
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
  p_renter_guest_id UUID DEFAULT NULL,
  p_marketing_consent BOOLEAN DEFAULT FALSE
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
    client_list = p_client_list, renter_guest_id = v_guest_id,
    marketing_consent = COALESCE(p_marketing_consent, FALSE),
    -- Preserve the original timestamp when consent was already on, so an unrelated edit
    -- does not restamp it; set it when consent flips on; clear it when it flips off.
    marketing_consent_at = CASE
      WHEN COALESCE(p_marketing_consent, FALSE) THEN COALESCE(v_existing.marketing_consent_at, now())
      ELSE NULL END
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
--
-- THE TRAP THIS FIXES: the inner call used to be POSITIONAL with 12 arguments, so a
-- defaulted 13th parameter would have silently recorded FALSE for every booking made from
-- the guests page. The call is now NAMED - positional calls are what created this trap.
CREATE OR REPLACE FUNCTION public.create_guest_manual_booking(
  p_property_id UUID, p_check_in DATE, p_check_out DATE, p_name TEXT,
  p_phone TEXT DEFAULT NULL, p_note TEXT DEFAULT NULL,
  p_marketing_consent BOOLEAN DEFAULT FALSE
)
RETURNS manual_bookings
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_guest_id UUID; v_owner UUID := auth.uid(); v_booking manual_bookings;
BEGIN
  IF v_owner IS NULL THEN RAISE EXCEPTION 'ავტორიზაცია საჭიროა' USING ERRCODE = '42501'; END IF;
  v_guest_id := ensure_renter_guest(v_owner, p_name, p_phone);
  SELECT * INTO v_booking FROM create_manual_booking(
    p_property_id       => p_property_id,
    p_check_in          => p_check_in,
    p_check_out         => p_check_out,
    p_source            => NULL,
    p_guest_name        => p_name,
    p_guest_phone       => p_phone,
    p_guests_count      => NULL,
    p_amount            => NULL,
    p_note              => p_note,
    p_status            => 'manual',
    p_client_list       => NULL,
    p_renter_guest_id   => v_guest_id,
    p_marketing_consent => p_marketing_consent
  );
  UPDATE renter_guests SET visit_dates = NULL WHERE id = v_guest_id;
  RETURN v_booking;
END;
$$;

-- Grants attach to the signature and the DROPs above removed them. Mirrors
-- 20260721160000:249-255 for the three NEW signatures.
REVOKE ALL ON FUNCTION public.create_manual_booking(UUID,DATE,DATE,TEXT,TEXT,TEXT,INT,NUMERIC,TEXT,TEXT,TEXT,UUID,BOOLEAN) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_manual_booking(UUID,DATE,DATE,TEXT,TEXT,TEXT,INT,NUMERIC,TEXT,TEXT,TEXT,UUID,BOOLEAN) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_guest_manual_booking(UUID,DATE,DATE,TEXT,TEXT,TEXT,BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_manual_booking(UUID,DATE,DATE,TEXT,TEXT,TEXT,INT,NUMERIC,TEXT,TEXT,TEXT,UUID,BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_manual_booking(UUID,DATE,DATE,TEXT,TEXT,TEXT,INT,NUMERIC,TEXT,TEXT,TEXT,UUID,BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_guest_manual_booking(UUID,DATE,DATE,TEXT,TEXT,TEXT,BOOLEAN) TO authenticated;

notify pgrst, 'reload schema';
