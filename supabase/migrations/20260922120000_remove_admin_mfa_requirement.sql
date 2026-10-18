-- Admin access no longer requires TOTP step-up (AAL2).  The application-side
-- gates (requireAdmin / isAdminViewer / dashboard/admin/layout.tsx) and the
-- /auth/mfa enrollment page were removed in the same change, so keeping the
-- assurance-level conjunct here would leave every admin RLS policy and
-- protected-column trigger denying an admin who can now reach the dashboard.
-- NOTE for prod: this migration must NOT be applied ahead of the app-side
-- removal.  prod's code still runs the AAL2 gates, so a DB-only apply leaves
-- admins passing the app gate's TOTP check against a database that no longer
-- requires it (harmless), while the reverse order -- shipping the app change
-- without this migration -- locks every admin out silently.  Ship both.
-- Body copied from the live definition (20260815122000) with only the
-- COALESCE(auth.jwt() ->> 'aal', '') = 'aal2' conjunct removed.
CREATE OR REPLACE FUNCTION public.is_admin_user()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO public
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = auth.uid()
      AND role = 'admin'
  );
$function$;

-- Grants restated verbatim: CREATE OR REPLACE keeps them, but the policies
-- across the schema execute this predicate as both anon and authenticated.
REVOKE ALL ON FUNCTION public.is_admin_user() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin_user() TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
