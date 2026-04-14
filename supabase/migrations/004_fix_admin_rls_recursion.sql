-- Prevent recursive policy evaluation by checking admin role via
-- a SECURITY DEFINER helper instead of querying profiles in policies.
CREATE OR REPLACE FUNCTION public.is_admin_user()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = auth.uid()
      AND role = 'admin'
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_admin_user() TO anon, authenticated;

DROP POLICY IF EXISTS "Admins full access profiles" ON profiles;
DROP POLICY IF EXISTS "Admins full access properties" ON properties;
DROP POLICY IF EXISTS "Admins full access verifications" ON verifications;
DROP POLICY IF EXISTS "Admins full access bookings" ON bookings;
DROP POLICY IF EXISTS "Admins full access notifications" ON notifications;

CREATE POLICY "Admins full access profiles" ON profiles
  FOR ALL
  USING (public.is_admin_user())
  WITH CHECK (public.is_admin_user());

CREATE POLICY "Admins full access properties" ON properties
  FOR ALL
  USING (public.is_admin_user())
  WITH CHECK (public.is_admin_user());

CREATE POLICY "Admins full access verifications" ON verifications
  FOR ALL
  USING (public.is_admin_user())
  WITH CHECK (public.is_admin_user());

CREATE POLICY "Admins full access bookings" ON bookings
  FOR ALL
  USING (public.is_admin_user())
  WITH CHECK (public.is_admin_user());

CREATE POLICY "Admins full access notifications" ON notifications
  FOR ALL
  USING (public.is_admin_user())
  WITH CHECK (public.is_admin_user());
