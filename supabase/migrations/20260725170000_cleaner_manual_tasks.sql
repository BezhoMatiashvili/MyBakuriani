-- Cleaner-authored manual (off-platform) jobs.
--
-- A cleaner gets most of their work outside the platform: the client phones them
-- directly, has no listing and has no profile row.  Those jobs cannot live in
-- public.cleaning_tasks — that table requires BOTH a property_id and an owner_id,
-- and 20260723000000_production_security_remediation.sql:317-322 deliberately
-- dropped its INSERT/UPDATE policies because a platform cleaning job is a
-- two-party workflow whose cleaner and price must be derived server-side.
--
-- A manual job has NO counterparty.  The cleaner is its sole author, sole reader
-- and sole subject, so there is no authority to derive and nothing to protect
-- from a browser write.  That is precisely what makes a plain owner-scoped
-- FOR ALL policy correct here and wrong on cleaning_tasks.
--
-- Same shape as public.manual_bookings / public.renter_cleaners
-- (20260525120000_renter_tools_tables.sql), this repo's existing precedent for
-- "off-platform twin of a platform entity".

CREATE TABLE IF NOT EXISTS public.cleaner_manual_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cleaner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  client_name TEXT NOT NULL,
  client_phone TEXT,
  address TEXT,
  cleaning_type TEXT NOT NULL DEFAULT 'standard',
  scheduled_at TIMESTAMPTZ NOT NULL,
  price NUMERIC(10,2),
  -- 'accepted', NOT 'pending': the cleaner books the job themselves, so there is
  -- nobody to accept it from.  It is also the status set that
  -- dashboard/cleaner/schedule/page.tsx already filters on, so a manual row
  -- renders through the existing card and its start/complete buttons unchanged.
  status TEXT NOT NULL DEFAULT 'accepted',
  notes TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT cleaner_manual_tasks_status_check
    CHECK (status IN ('accepted', 'in_progress', 'completed')),
  CONSTRAINT cleaner_manual_tasks_client_name_len
    CHECK (char_length(btrim(client_name)) BETWEEN 1 AND 120),
  CONSTRAINT cleaner_manual_tasks_cleaning_type_len
    CHECK (char_length(btrim(cleaning_type)) BETWEEN 1 AND 80),
  CONSTRAINT cleaner_manual_tasks_address_len
    CHECK (address IS NULL OR char_length(address) <= 300),
  CONSTRAINT cleaner_manual_tasks_notes_len
    CHECK (notes IS NULL OR char_length(notes) <= 1000),
  CONSTRAINT cleaner_manual_tasks_price_range
    CHECK (price IS NULL OR (price >= 0 AND price <= 100000))
);

-- The only access pattern: "my jobs, newest/oldest first" (schedule filters a day
-- client-side from the same set; earnings orders by scheduled_at desc).
CREATE INDEX IF NOT EXISTS idx_cleaner_manual_tasks_cleaner_scheduled
  ON public.cleaner_manual_tasks (cleaner_id, scheduled_at DESC);

ALTER TABLE public.cleaner_manual_tasks ENABLE ROW LEVEL SECURITY;

-- One policy covers select/insert/update/delete: the row owner is the only party.
-- (select auth.uid()) so the initplan is cached once per statement.
DROP POLICY IF EXISTS "Cleaners manage own manual tasks" ON public.cleaner_manual_tasks;
CREATE POLICY "Cleaners manage own manual tasks" ON public.cleaner_manual_tasks
  FOR ALL TO authenticated
  USING (cleaner_id = (select auth.uid()))
  WITH CHECK (cleaner_id = (select auth.uid()));

-- Server-side backstop for the client-side PhoneInput / isValidGePhone pair,
-- reusing the shared validator already attached to manual_bookings.guest_phone
-- and leads.client_phone (20260628130000_ge_phone_format_validation.sql).
DROP TRIGGER IF EXISTS trg_ge_phone ON public.cleaner_manual_tasks;
CREATE TRIGGER trg_ge_phone
  BEFORE INSERT OR UPDATE OF client_phone ON public.cleaner_manual_tasks
  FOR EACH ROW EXECUTE FUNCTION public.validate_ge_phone('client_phone');

CREATE OR REPLACE FUNCTION public.set_cleaner_manual_task_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END;
$$;
REVOKE ALL ON FUNCTION public.set_cleaner_manual_task_updated_at() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS set_cleaner_manual_tasks_updated_at ON public.cleaner_manual_tasks;
CREATE TRIGGER set_cleaner_manual_tasks_updated_at
  BEFORE UPDATE ON public.cleaner_manual_tasks
  FOR EACH ROW EXECUTE FUNCTION public.set_cleaner_manual_task_updated_at();

-- DELIBERATELY OMITTED, do not "fix" these without re-reading the reasoning:
--
-- 1. No trg_audit_row.  audit_row_change() stores a full row snapshot in
--    audit_logs.new_values, which src/app/api/admin/logs/route.ts renders in the
--    admin log UI.  These rows hold the name and phone of an OFF-PLATFORM third
--    party who never signed up; that PII should not become admin-readable as a
--    side effect of a cleaner keeping their own diary.
--
-- 2. Not added to the supabase_realtime publication (contract C7).  The row owner
--    is the only writer AND the only reader, so there is no event to deliver to a
--    second party; the schedule page refetches after its own writes.  Realtime
--    churn is a diagnosed past cause of production slowness
--    (20260712000000_trim_realtime_publication.sql), so membership here would be
--    pure cost.  A future cross-device sync requirement is the only reason to add
--    it — and then the schedule page must also subscribe.

-- PostgREST caches the schema catalogue; without this the new table 404s.
NOTIFY pgrst, 'reload schema';
