-- Adds organization-shared visibility/editing to the leads CRM, mirroring the
-- existing pattern on properties. Additive only — the owner-only policies in
-- 013_leads.sql are untouched; these are net-new PERMISSIVE policies that OR
-- together with them (Postgres ORs multiple permissive policies), so this
-- strictly widens access, never narrows it.

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS organization_id uuid
  REFERENCES public.organizations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_leads_org ON public.leads(organization_id);

DROP POLICY IF EXISTS "leads_org_select" ON public.leads;
CREATE POLICY "leads_org_select" ON public.leads FOR SELECT USING (
  organization_id IN (
    SELECT m.organization_id FROM public.organization_members m
    WHERE m.user_id = (select auth.uid()) AND m.status = 'approved'
  )
);

DROP POLICY IF EXISTS "leads_org_update" ON public.leads;
CREATE POLICY "leads_org_update" ON public.leads FOR UPDATE
  USING ( organization_id IN (
    SELECT m.organization_id FROM public.organization_members m
    WHERE m.user_id = (select auth.uid()) AND m.status = 'approved') )
  WITH CHECK ( organization_id IN (
    SELECT m.organization_id FROM public.organization_members m
    WHERE m.user_id = (select auth.uid()) AND m.status = 'approved') );

DROP POLICY IF EXISTS "leads_org_insert" ON public.leads;
CREATE POLICY "leads_org_insert" ON public.leads FOR INSERT WITH CHECK (
  (select auth.uid()) = owner_id
  AND organization_id IN (
    SELECT m.organization_id FROM public.organization_members m
    WHERE m.user_id = (select auth.uid()) AND m.status = 'approved')
);
