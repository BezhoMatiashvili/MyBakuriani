-- properties.amenities must be a JSON array of strings (2026-10-16, gate round 9
-- F-V4-R9-01).
--
-- The column is jsonb with no CHECK and is in the client INSERT grant (C34). An
-- owner could store [5], [{"toString":0}], [null] or a non-array. Once an admin
-- approves the listing, public_properties returns the value unchanged and the
-- list pages call string methods on every element (InvestmentCard `value.trim`,
-- listing-options `Object.hasOwn`): /sales/all answered 500 on every request,
-- /sales and /apartments failed to regenerate, and `next build` aborted while
-- prerendering /ka/sales, so one public row blocked every redeploy.
--
-- The database now refuses it: NULL, or an array whose elements are all strings
-- (staging: 45 rows, all arrays of 0-17 strings). Same shape as
-- hotel_rooms_valid (C45): INVOKER, empty search_path, EXECUTE for the roles that
-- write properties. Refuses (55000) while an existing row breaks the rule.

CREATE FUNCTION public.jsonb_string_array_valid(p jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  -- CASE (not AND): SQL does not promise to evaluate AND operands left to right.
  SELECT CASE
    WHEN p IS NULL THEN true
    WHEN jsonb_typeof(p) <> 'array' THEN false
    ELSE NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(p) AS e WHERE jsonb_typeof(e) <> 'string'
    )
  END
$$;

REVOKE ALL ON FUNCTION public.jsonb_string_array_valid(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.jsonb_string_array_valid(jsonb) TO authenticated, service_role;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.properties WHERE NOT public.jsonb_string_array_valid(amenities)) THEN
    RAISE EXCEPTION 'a properties row has amenities that is not an array of strings; fix it first'
      USING ERRCODE = '55000';
  END IF;
END
$$;

ALTER TABLE public.properties
  ADD CONSTRAINT properties_amenities_string_array CHECK (public.jsonb_string_array_valid(amenities));
