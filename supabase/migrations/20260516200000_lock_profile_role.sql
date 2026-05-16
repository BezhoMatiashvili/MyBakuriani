-- Privilege-escalation hardening: prevent users from updating their own
-- profiles.role via Supabase client.
--
-- Background: 002_rls_policies.sql:19 grants
--   "Users can update own profile" ON profiles FOR UPDATE USING (auth.uid() = id)
-- with no WITH CHECK and no column restriction, which lets any authenticated
-- user run `update profiles set role='admin' where id = auth.uid()`. Because
-- require-admin.ts and the "Admins full access *" policies all gate on
-- profiles.role, that one statement grants full admin access.
--
-- Fix: a BEFORE UPDATE trigger that blocks role changes unless the caller is
-- (a) the service role (server-side code with SUPABASE_SERVICE_ROLE_KEY),
-- (b) the postgres superuser (migrations / SQL editor), or
-- (c) an authenticated user whose own profile.role = 'admin' (so the existing
--     admin clients page at dashboard/admin/clients/[id]:105 keeps working).
--
-- Non-admin users can no longer set role='admin' on their own row.
--
-- ROLLBACK:
--   DROP TRIGGER IF EXISTS profiles_lock_role ON public.profiles;
--   DROP FUNCTION IF EXISTS public.prevent_profile_role_change();

CREATE OR REPLACE FUNCTION public.prevent_profile_role_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  caller_role text;
BEGIN
  -- Only act when role actually changed.
  IF NEW.role IS NOT DISTINCT FROM OLD.role THEN
    RETURN NEW;
  END IF;

  -- auth.role() reads the JWT role claim: 'service_role' for trusted server
  -- callers, 'authenticated' for normal users, 'anon' for unauthenticated,
  -- or NULL when invoked outside the PostgREST request context (e.g. from
  -- another trigger or a migration). Allow service_role and direct DB calls.
  BEGIN
    caller_role := auth.role();
  EXCEPTION WHEN OTHERS THEN
    caller_role := NULL;
  END;

  IF caller_role IS NULL OR caller_role = 'service_role' THEN
    RETURN NEW;
  END IF;

  -- Allow admins (verified by checking their own profile row) to promote /
  -- demote other users via the admin dashboard.
  IF EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  ) THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION
    'Changing profiles.role is not permitted from a non-admin user session'
    USING ERRCODE = '42501'; -- insufficient_privilege
END;
$$;

DROP TRIGGER IF EXISTS profiles_lock_role ON public.profiles;
CREATE TRIGGER profiles_lock_role
BEFORE UPDATE OF role ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.prevent_profile_role_change();
