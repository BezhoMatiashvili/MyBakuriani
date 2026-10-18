-- Coordinate range checks on properties and organizations (2026-10-16, gate
-- round 8 F-V5-R8-01).
--
-- properties.location_lat / location_lng (numeric(10,7)) and
-- organizations.location_lat / location_lng (double precision) have no range
-- check, and authenticated holds INSERT/UPDATE on them (C34). A numeric or
-- float NaN is storable there, and PostgREST sends it as the JSON string "NaN":
-- the daily `sms-automation-run` called toFixed on it, threw, and answered 500
-- for the whole run (the reminders of every owner after that row went unsent).
-- The edge function now treats a non-finite pin as no pin; this makes the
-- database refuse such a value for good. In PostgreSQL NaN sorts above every
-- number, so BETWEEN refuses it; NULL (no pin) still passes. The forms already
-- keep typed values inside these ranges (ExactLocationPicker).
--
-- Refuses (55000) while an existing row is outside the range, so a project
-- holding one is fixed by hand first.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.properties
    WHERE (location_lat IS NOT NULL AND NOT (location_lat BETWEEN -90 AND 90))
       OR (location_lng IS NOT NULL AND NOT (location_lng BETWEEN -180 AND 180))
  ) OR EXISTS (
    SELECT 1 FROM public.organizations
    WHERE (location_lat IS NOT NULL AND NOT (location_lat BETWEEN -90 AND 90))
       OR (location_lng IS NOT NULL AND NOT (location_lng BETWEEN -180 AND 180))
  ) THEN
    RAISE EXCEPTION 'a properties or organizations row has a coordinate outside -90..90 / -180..180; fix it first'
      USING ERRCODE = '55000';
  END IF;
END
$$;

ALTER TABLE public.properties
  ADD CONSTRAINT properties_location_lat_range CHECK (location_lat BETWEEN -90 AND 90),
  ADD CONSTRAINT properties_location_lng_range CHECK (location_lng BETWEEN -180 AND 180);

ALTER TABLE public.organizations
  ADD CONSTRAINT organizations_location_lat_range CHECK (location_lat BETWEEN -90 AND 90),
  ADD CONSTRAINT organizations_location_lng_range CHECK (location_lng BETWEEN -180 AND 180);
