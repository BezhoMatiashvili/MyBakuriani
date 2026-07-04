-- Approved company members (owner or agent) get read/update/delete access to
-- ALL of their company's listings, not just rows they personally created.
-- These are additive PERMISSIVE policies alongside the existing owner-only
-- ones in 002_rls_policies.sql (do not touch/drop those).
--
-- Compatibility note (verified): enforce_org_listing_rules() in
-- 20260627090300_org_enforcement_trigger.sql checks NEW.owner_id (the row's
-- owner, not the editor) against approved membership — so agent B updating
-- agent A's org-tagged listing passes the trigger fine once RLS lets the
-- UPDATE through. Today's RLS (owner_id = auth.uid() only) is what blocks it;
-- this migration is the fix. Also note the trigger only fires
-- "BEFORE INSERT OR UPDATE OF organization_id, owner_id, status" — an UPDATE
-- that touches only e.g. price/photos won't even re-trigger it, so it's RLS
-- alone that gates whether the row is reachable at all.

DROP POLICY IF EXISTS "Org members read org properties" ON public.properties;
CREATE POLICY "Org members read org properties" ON public.properties FOR SELECT USING (
  organization_id IN (
    SELECT m.organization_id FROM public.organization_members m
    WHERE m.user_id = (select auth.uid()) AND m.status = 'approved')
);

DROP POLICY IF EXISTS "Org members update org properties" ON public.properties;
CREATE POLICY "Org members update org properties" ON public.properties FOR UPDATE
  USING ( organization_id IN (
    SELECT m.organization_id FROM public.organization_members m
    WHERE m.user_id = (select auth.uid()) AND m.status = 'approved') )
  WITH CHECK ( organization_id IN (
    SELECT m.organization_id FROM public.organization_members m
    WHERE m.user_id = (select auth.uid()) AND m.status = 'approved') );

DROP POLICY IF EXISTS "Org members delete org properties" ON public.properties;
CREATE POLICY "Org members delete org properties" ON public.properties FOR DELETE
  USING ( organization_id IN (
    SELECT m.organization_id FROM public.organization_members m
    WHERE m.user_id = (select auth.uid()) AND m.status = 'approved') );
