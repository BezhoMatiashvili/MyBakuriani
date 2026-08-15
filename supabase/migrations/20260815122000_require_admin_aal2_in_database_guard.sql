-- SECURITY: API routes require TOTP AAL2, but direct PostgREST/Storage calls
-- evaluate RLS without passing through those routes.  Make the shared database
-- admin predicate enforce the same assurance level so an AAL1 admin session
-- cannot bypass MFA by calling Supabase directly.
CREATE OR REPLACE FUNCTION public.is_admin_user()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO public
AS $function$
  SELECT COALESCE(auth.jwt() ->> 'aal', '') = 'aal2'
    AND EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE id = auth.uid()
        AND role = 'admin'
    );
$function$;

-- Policies across the schema execute this predicate as both anonymous and
-- authenticated roles.  Anonymous callers always receive false because they
-- have neither an AAL2 claim nor an admin profile.
REVOKE ALL ON FUNCTION public.is_admin_user() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin_user() TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
