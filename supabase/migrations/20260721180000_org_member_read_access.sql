-- Approved non-owner members ("agents") of a company hit two RLS read gaps:
--   1. organization_subscriptions has only an owner-read SELECT policy
--      (20260627090000_organizations_tables.sql), so the create/sale
--      active-package pre-check saw zero rows for agents and falsely blocked
--      posting on behalf of a subscribed company.
--   2. organizations is readable only when status = 'active' OR owner, so an
--      approved agent of a still-pending org saw no org at all (no "post as"
--      picker on create/sale, no scope-switcher entry).
-- Additive SELECT policies only; writes stay RPC-only.
--
-- The organizations policy must NOT subquery organization_members inline:
-- "org_members self or owner read" itself subqueries organizations, and two
-- tables whose policies reference each other trip Postgres's
-- infinite-recursion detection (42P17) on EVERY read of either table — the
-- same cycle is_admin_user() was created to break
-- (004_fix_admin_rls_recursion.sql). Hence the SECURITY DEFINER helper.
-- anon needs EXECUTE because permissive policies are OR-ed into anon reads of
-- organizations (public active read); auth.uid() is NULL there -> false.

CREATE OR REPLACE FUNCTION public.is_approved_org_member(p_org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.organization_members m
    WHERE m.organization_id = p_org_id
      AND m.user_id = auth.uid()
      AND m.status = 'approved'
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_approved_org_member(uuid) TO anon, authenticated;

DROP POLICY IF EXISTS "orgs member read own" ON public.organizations;
CREATE POLICY "orgs member read own" ON public.organizations
  FOR SELECT USING (public.is_approved_org_member(id));

DROP POLICY IF EXISTS "org_subs member read" ON public.organization_subscriptions;
CREATE POLICY "org_subs member read" ON public.organization_subscriptions
  FOR SELECT USING (public.is_approved_org_member(organization_id));
