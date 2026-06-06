-- 20260606141000_project_updates.sql
-- Additive: append-only feed of construction/progress updates per project.
-- Each "publish update" from the seller construction dialog inserts one row.
-- Non-destructive; mirrors RLS conventions from 013_leads.sql.

CREATE TABLE IF NOT EXISTS public.project_updates (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id  uuid NOT NULL REFERENCES public.properties (id) ON DELETE CASCADE,
  owner_id     uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  status       text,
  note         text,
  photos       text[] NOT NULL DEFAULT '{}',
  video_url    text,
  update_date  date NOT NULL DEFAULT current_date,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_project_updates_property ON public.project_updates (property_id);
CREATE INDEX IF NOT EXISTS idx_project_updates_owner ON public.project_updates (owner_id);
CREATE INDEX IF NOT EXISTS idx_project_updates_property_created ON public.project_updates (property_id, created_at DESC);

ALTER TABLE public.project_updates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "project_updates_owner_select" ON public.project_updates;
CREATE POLICY "project_updates_owner_select"
  ON public.project_updates FOR SELECT
  USING (auth.uid() = owner_id);

DROP POLICY IF EXISTS "project_updates_owner_insert" ON public.project_updates;
CREATE POLICY "project_updates_owner_insert"
  ON public.project_updates FOR INSERT
  WITH CHECK (auth.uid() = owner_id);

DROP POLICY IF EXISTS "project_updates_owner_update" ON public.project_updates;
CREATE POLICY "project_updates_owner_update"
  ON public.project_updates FOR UPDATE
  USING (auth.uid() = owner_id)
  WITH CHECK (auth.uid() = owner_id);

DROP POLICY IF EXISTS "project_updates_owner_delete" ON public.project_updates;
CREATE POLICY "project_updates_owner_delete"
  ON public.project_updates FOR DELETE
  USING (auth.uid() = owner_id);

DROP POLICY IF EXISTS "project_updates_admin_all" ON public.project_updates;
CREATE POLICY "project_updates_admin_all"
  ON public.project_updates FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

-- DOWN:
-- DROP TABLE IF EXISTS public.project_updates CASCADE;
