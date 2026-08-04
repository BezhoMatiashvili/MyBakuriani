-- Apply an owner calendar availability change in one transaction.
--
-- The dashboard previously issued client-side DELETE/UPSERT calls using a
-- stale booked-date snapshot. That made mixed operations non-atomic and could
-- overwrite a booking that landed between the read and write. Use the same
-- per-property advisory lock as the booking RPCs and never update booked rows.

CREATE OR REPLACE FUNCTION public.apply_calendar_availability(
  p_property_id UUID,
  p_dates DATE[],
  p_action TEXT
)
RETURNS TABLE(changed_dates DATE[], skipped_booked_dates DATE[])
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner UUID := auth.uid();
  v_dates DATE[] := ARRAY[]::DATE[];
  v_changed DATE[] := ARRAY[]::DATE[];
  v_skipped DATE[] := ARRAY[]::DATE[];
BEGIN
  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'ავტორიზაცია საჭიროა' USING ERRCODE = '42501';
  END IF;
  IF p_action NOT IN ('available', 'blocked') THEN
    RAISE EXCEPTION 'არასწორი მოქმედება' USING ERRCODE = '22023';
  END IF;
  IF cardinality(COALESCE(p_dates, ARRAY[]::DATE[])) > 366 THEN
    RAISE EXCEPTION 'თარიღების რაოდენობა მეტისმეტად დიდია' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.properties p
    WHERE p.id = p_property_id
      AND p.owner_id = v_owner
  ) THEN
    RAISE EXCEPTION 'ობიექტი ვერ მოიძებნა ან თქვენ არ ხართ მფლობელი'
      USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(array_agg(d ORDER BY d), ARRAY[]::DATE[])
  INTO v_dates
  FROM (
    SELECT DISTINCT value AS d
    FROM unnest(COALESCE(p_dates, ARRAY[]::DATE[])) AS valueset(value)
    WHERE value IS NOT NULL
  ) normalized;

  IF cardinality(v_dates) = 0 THEN
    RETURN QUERY SELECT v_changed, v_skipped;
    RETURN;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_property_id::text, 0));

  SELECT COALESCE(array_agg(cb.date ORDER BY cb.date), ARRAY[]::DATE[])
  INTO v_skipped
  FROM public.calendar_blocks cb
  WHERE cb.property_id = p_property_id
    AND cb.date = ANY(v_dates)
    AND cb.status = 'booked';

  IF p_action = 'available' THEN
    WITH deleted AS (
      DELETE FROM public.calendar_blocks cb
      WHERE cb.property_id = p_property_id
        AND cb.date = ANY(v_dates)
        AND cb.status = 'blocked'
      RETURNING cb.date
    )
    SELECT COALESCE(array_agg(deleted.date ORDER BY deleted.date), ARRAY[]::DATE[])
    INTO v_changed
    FROM deleted;
  ELSE
    WITH requested AS (
      SELECT unnest(v_dates) AS date
    ), changed AS (
      INSERT INTO public.calendar_blocks (property_id, date, status, booking_id)
      SELECT p_property_id, requested.date, 'blocked', NULL
      FROM requested
      ON CONFLICT (property_id, date) DO UPDATE
        SET status = 'blocked', booking_id = NULL
        WHERE calendar_blocks.status = 'available'
      RETURNING date
    )
    SELECT COALESCE(array_agg(changed.date ORDER BY changed.date), ARRAY[]::DATE[])
    INTO v_changed
    FROM changed;
  END IF;

  RETURN QUERY SELECT v_changed, v_skipped;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_calendar_availability(UUID, DATE[], TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.apply_calendar_availability(UUID, DATE[], TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.apply_calendar_availability(UUID, DATE[], TEXT) TO authenticated;

NOTIFY pgrst, 'reload schema';
