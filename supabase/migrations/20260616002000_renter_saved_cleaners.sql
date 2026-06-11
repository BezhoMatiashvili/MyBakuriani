-- Renter "my cleaners": links a renter to platform cleaners picked from the
-- directory returned by get_platform_cleaners(). Owner-scoped RLS modeled on
-- renter_guests. Additive + idempotent (safe to re-apply).

CREATE TABLE IF NOT EXISTS public.renter_saved_cleaners (
  owner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  cleaner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (owner_id, cleaner_id)
);

-- PK already serves owner_id lookups (leading column); this index supports
-- the FK cascade path when a cleaner profile is deleted.
CREATE INDEX IF NOT EXISTS idx_renter_saved_cleaners_cleaner
  ON public.renter_saved_cleaners(cleaner_id);

ALTER TABLE public.renter_saved_cleaners ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Owners manage own saved cleaners" ON public.renter_saved_cleaners
    FOR ALL USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
