-- Hide company listings publicly until the company is admin-verified
-- (organizations.status = 'active'). Replaces the existing permissive SELECT
-- policy on properties. Owners still see their own listings (any status), and
-- the separate "Admins full access properties" policy keeps admin read intact.
--
-- Previous definition (for rollback):
--   USING ((status = 'active') OR (owner_id = (select auth.uid())))
DROP POLICY IF EXISTS "Active properties are viewable" ON public.properties;
CREATE POLICY "Active properties are viewable" ON public.properties
FOR SELECT USING (
  (
    status = 'active'
    AND (
      organization_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.organizations o
        WHERE o.id = properties.organization_id
          AND o.status = 'active'
      )
    )
  )
  OR owner_id = (select auth.uid())
);
