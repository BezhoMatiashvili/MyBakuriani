-- leads: an owner's own policies no longer reach into an agency's board (2026-10-13).
--
-- leads_owner_insert / leads_owner_update checked only owner_id, so any signed-in
-- user could insert a lead into any organization (org ids are public) or move a
-- personal lead there; every approved member then saw it on the agency's sales
-- board, and nobody there could delete it. Org-scoped writes keep going through
-- leads_org_insert / leads_org_update (approved members only), which is how the
-- sales board writes them (SalesBoard.tsx sets organization_id only in org scope).

ALTER POLICY leads_owner_insert ON public.leads
  WITH CHECK ((SELECT auth.uid()) = owner_id AND organization_id IS NULL);

ALTER POLICY leads_owner_update ON public.leads
  USING ((SELECT auth.uid()) = owner_id)
  WITH CHECK ((SELECT auth.uid()) = owner_id AND organization_id IS NULL);
