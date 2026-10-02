-- A call-out's time must be a real, near date.
--
-- create_cleaning_task only checked p_scheduled_at < now(), so 'infinity' (or any date
-- past year 275760) was accepted. Such a row cannot be formatted by the cleaner's
-- dashboard (date-fns throws RangeError), so one property owner could make a cleaner's
-- whole incoming-request page fail to render, with the Accept/Decline buttons never
-- reachable, and the bell text became NULL. Reject a non-finite date and anything more
-- than two years out with the same 22023 as the other invalid inputs.
-- The body below is the live one (md5 checked before this was written); only the
-- validation clause gained two conditions.

CREATE OR REPLACE FUNCTION public.create_cleaning_task(
  p_property_id uuid,
  p_cleaner_service_id uuid,
  p_cleaning_type text,
  p_scheduled_at timestamptz,
  p_notes text DEFAULT NULL,
  p_address text DEFAULT NULL
) RETURNS public.cleaning_tasks
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_task public.cleaning_tasks;
  v_cleaner uuid;
  v_price numeric;
  v_price_unit text;
  v_service_title text;
  v_owner uuid;
  v_property_location text;
  v_address text;
BEGIN
  IF auth.uid() IS NULL
    OR p_scheduled_at < now()
    OR NOT isfinite(p_scheduled_at)
    OR p_scheduled_at > now() + interval '2 years'
    OR length(btrim(p_cleaning_type)) NOT BETWEEN 1 AND 80
    OR length(btrim(coalesce(p_address, ''))) > 300
  THEN
    RAISE EXCEPTION 'Invalid cleaning task' USING ERRCODE = '22023';
  END IF;

  SELECT owner_id, location
    INTO v_owner, v_property_location
  FROM public.properties
  WHERE id = p_property_id;

  IF v_owner IS NULL OR v_owner <> auth.uid() THEN
    RAISE EXCEPTION 'Property not owned by caller' USING ERRCODE = '42501';
  END IF;

  SELECT owner_id, price, price_unit, title
    INTO v_cleaner, v_price, v_price_unit, v_service_title
  FROM public.services
  WHERE id = p_cleaner_service_id
    AND category = 'cleaning'
    AND status = 'active';

  IF v_cleaner IS NULL THEN
    RAISE EXCEPTION 'Cleaner unavailable' USING ERRCODE = '22023';
  END IF;

  v_address := coalesce(
    nullif(btrim(p_address), ''),
    nullif(btrim(v_property_location), '')
  );

  INSERT INTO public.cleaning_tasks (
    property_id,
    owner_id,
    cleaner_id,
    cleaner_service_id,
    service_title,
    cleaning_type,
    scheduled_at,
    price,
    price_unit,
    address,
    notes
  ) VALUES (
    p_property_id,
    v_owner,
    v_cleaner,
    p_cleaner_service_id,
    v_service_title,
    btrim(p_cleaning_type),
    p_scheduled_at,
    v_price,
    v_price_unit,
    v_address,
    left(p_notes, 1000)
  )
  RETURNING * INTO v_task;

  RETURN v_task;
END;
$$;

REVOKE ALL ON FUNCTION public.create_cleaning_task(
  uuid, uuid, text, timestamptz, text, text
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_cleaning_task(
  uuid, uuid, text, timestamptz, text, text
) TO authenticated;

NOTIFY pgrst, 'reload schema';
