-- Renter "add cleaner" modal must list EVERY active cleaning service,
-- including ones owned by the viewing user (product decision 2026-07-21):
-- same body as 20260614120000_cleaner_dashboard_and_call_flow.sql, minus the
-- `s.owner_id <> auth.uid()` self-exclusion. One row per service; the client
-- decides whether to dedupe per person.

CREATE OR REPLACE FUNCTION public.get_platform_cleaners()
RETURNS TABLE (
  service_id uuid,
  cleaner_id uuid,
  name text,
  avatar_url text,
  phone text,
  whatsapp text,
  price numeric,
  price_unit text,
  location text,
  photo text,
  is_online boolean
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT s.id,
         s.owner_id,
         COALESCE(NULLIF(btrim(concat_ws(' ', cp.first_name, cp.last_name)), ''),
                  s.provider_name, p.display_name),
         p.avatar_url,
         COALESCE(cp.phone, s.phone, p.phone),
         COALESCE(cp.whatsapp, s.whatsapp),
         s.price,
         s.price_unit,
         s.location,
         s.photos[1],
         COALESCE(cp.is_online, true)
  FROM public.services s
  JOIN public.profiles p ON p.id = s.owner_id
  LEFT JOIN public.cleaner_profiles cp ON cp.id = s.owner_id
  WHERE s.category = 'cleaning'
    AND s.status = 'active';
$$;

REVOKE ALL ON FUNCTION public.get_platform_cleaners() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_platform_cleaners() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_platform_cleaners() TO authenticated;
