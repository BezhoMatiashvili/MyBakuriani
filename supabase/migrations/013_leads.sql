-- 013_leads.sql — Seller CRM Leads table
-- NOTE: Non-destructive. Creates a new table only. Review before applying.
-- To apply: run via Supabase dashboard or `supabase db push`.

CREATE TYPE IF NOT EXISTS lead_stage AS ENUM (
  'new',
  'contacted',
  'shown',
  'negotiating',
  'closed'
);

CREATE TYPE IF NOT EXISTS lead_priority AS ENUM ('low', 'medium', 'high');

CREATE TYPE IF NOT EXISTS lead_source AS ENUM (
  'smart_match',
  'direct',
  'call',
  'walk_in',
  'referral',
  'other'
);

CREATE TABLE IF NOT EXISTS public.leads (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id     uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  property_id  uuid REFERENCES public.properties (id) ON DELETE SET NULL,
  client_name  text NOT NULL,
  client_phone text,
  source       lead_source DEFAULT 'direct',
  stage        lead_stage NOT NULL DEFAULT 'new',
  priority     lead_priority NOT NULL DEFAULT 'medium',
  budget_min   numeric,
  budget_max   numeric,
  currency     text NOT NULL DEFAULT 'USD',
  note         text,
  next_action_at timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_leads_owner ON public.leads (owner_id);
CREATE INDEX IF NOT EXISTS idx_leads_stage ON public.leads (stage);
CREATE INDEX IF NOT EXISTS idx_leads_owner_stage ON public.leads (owner_id, stage);

ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "leads_owner_select"
  ON public.leads FOR SELECT
  USING (auth.uid() = owner_id);

CREATE POLICY "leads_owner_insert"
  ON public.leads FOR INSERT
  WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "leads_owner_update"
  ON public.leads FOR UPDATE
  USING (auth.uid() = owner_id)
  WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "leads_owner_delete"
  ON public.leads FOR DELETE
  USING (auth.uid() = owner_id);

CREATE POLICY "leads_admin_all"
  ON public.leads FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

CREATE OR REPLACE FUNCTION public.leads_touch_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS leads_updated_at ON public.leads;
CREATE TRIGGER leads_updated_at
  BEFORE UPDATE ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.leads_touch_updated_at();
