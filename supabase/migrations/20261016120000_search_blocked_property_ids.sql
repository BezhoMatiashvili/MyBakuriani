-- Date-filtered search: blocked listings resolved in the database, for public
-- listings only (2026-10-16, gate round 7 V1-R7-01).
--
-- The `search` edge function (service role) listed every calendar_blocks row in
-- the requested range, whoever owned the listing and whatever its status, and
-- put the distinct listing ids into one `id=not.in.(...)` URL (37 characters per
-- id). Any signed-in user can insert calendar_blocks rows for listings they own,
-- pending ones included (the INSERT policy only checks owner_id), with no cap, so
-- that list was user-writable: the hosted REST layer answers 400 past about 650
-- ids, which the function turned into a 500 for every visitor whose dates covered
-- those rows (the page then falls back to its 100 server-rendered rows without
-- the date check).
--
-- This function returns only the ids of PUBLIC listings (public_properties, i.e.
-- admin-approved) with a booked or blocked night in [p_from, p_to): the same
-- predicate as before. The main query reads public_properties, so leaving the
-- non-public ids out of the exclusion list changes no result; what remains is
-- bounded by the approved inventory. The edge function calls it with the same
-- check_in/check_out it used to scan with; an invalid date still raises 22007.
-- INVOKER with an empty search_path; service_role only (C34).

CREATE FUNCTION public.search_blocked_property_ids(p_from date, p_to date)
 RETURNS SETOF uuid
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  SELECT DISTINCT cb.property_id
  FROM public.calendar_blocks cb
  JOIN public.public_properties pp ON pp.id = cb.property_id
  WHERE cb.date >= p_from
    AND cb.date < p_to
    AND cb.status IN ('booked', 'blocked')
$function$;

REVOKE ALL ON FUNCTION public.search_blocked_property_ids(date, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.search_blocked_property_ids(date, date) TO service_role;
