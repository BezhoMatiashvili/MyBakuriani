-- Rich, owner-private profiles for cleaners a renter records manually.
-- Platform cleaner details continue to come from the safe public_services view.

ALTER TABLE public.renter_cleaners
  ADD COLUMN IF NOT EXISTS location text,
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS experience_years smallint,
  ADD COLUMN IF NOT EXISTS languages text[],
  ADD COLUMN IF NOT EXISTS schedule text;

DO $$
BEGIN
  ALTER TABLE public.renter_cleaners
    ADD CONSTRAINT renter_cleaners_experience_years_check
    CHECK (experience_years IS NULL OR experience_years BETWEEN 0 AND 60);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

COMMENT ON COLUMN public.renter_cleaners.location IS
  'Comma-separated service coverage zones entered by the owning renter.';
COMMENT ON COLUMN public.renter_cleaners.description IS
  'Owner-entered summary of the manual cleaner''s capabilities.';

NOTIFY pgrst, 'reload schema';
