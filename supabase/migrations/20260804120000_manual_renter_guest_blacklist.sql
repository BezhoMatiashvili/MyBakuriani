-- Let a renter add a standalone CRM contact directly to the blacklist.
-- A normalized phone match reuses the renter's canonical existing contact so
-- stay history is preserved and a second contact is not created.

CREATE OR REPLACE FUNCTION public.add_renter_guest_to_blacklist(
  p_name TEXT,
  p_phone TEXT DEFAULT NULL,
  p_note TEXT DEFAULT NULL
)
RETURNS public.renter_guests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner UUID := auth.uid();
  v_name TEXT := NULLIF(btrim(p_name), '');
  v_phone TEXT := NULLIF(btrim(p_phone), '');
  v_phone_key TEXT;
  v_guest public.renter_guests%ROWTYPE;
BEGIN
  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'ავტორიზაცია საჭიროა' USING ERRCODE = '42501';
  END IF;

  IF v_name IS NULL THEN
    RAISE EXCEPTION 'სტუმრის სახელი აუცილებელია' USING ERRCODE = '22023';
  END IF;

  IF v_phone IS NOT NULL AND v_phone !~ '^(\+995)?5[0-9]{8}$' THEN
    RAISE EXCEPTION 'ტელეფონის ნომერი არასწორია' USING ERRCODE = '23514';
  END IF;

  v_phone_key := normalize_ge_phone(v_phone);

  IF v_phone_key IS NOT NULL THEN
    -- Serialize concurrent manual blacklist submissions for the same renter and
    -- phone. Existing legacy duplicates are resolved using the same stable
    -- oldest-first rule as ensure_renter_guest.
    PERFORM pg_advisory_xact_lock(
      hashtextextended(v_owner::TEXT || ':' || v_phone_key, 0)
    );

    SELECT * INTO v_guest
    FROM public.renter_guests
    WHERE owner_id = v_owner
      AND normalize_ge_phone(phone) = v_phone_key
    ORDER BY created_at NULLS LAST, id
    LIMIT 1;

    IF FOUND THEN
      IF NOT v_guest.blacklisted THEN
        UPDATE public.renter_guests
        SET blacklisted = TRUE,
            updated_at = now()
        WHERE id = v_guest.id
          AND owner_id = v_owner
        RETURNING * INTO v_guest;
      END IF;

      RETURN v_guest;
    END IF;
  END IF;

  INSERT INTO public.renter_guests (
    owner_id,
    name,
    phone,
    note,
    blacklisted
  )
  VALUES (
    v_owner,
    v_name,
    CASE WHEN v_phone_key IS NULL THEN NULL ELSE '+995' || v_phone_key END,
    NULLIF(btrim(p_note), ''),
    TRUE
  )
  RETURNING * INTO v_guest;

  RETURN v_guest;
END;
$$;

REVOKE ALL ON FUNCTION public.add_renter_guest_to_blacklist(TEXT, TEXT, TEXT)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.add_renter_guest_to_blacklist(TEXT, TEXT, TEXT)
  TO authenticated;

NOTIFY pgrst, 'reload schema';
