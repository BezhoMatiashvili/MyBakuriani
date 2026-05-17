ALTER TABLE public.properties
  ADD COLUMN IF NOT EXISTS construction_progress_percent SMALLINT
  CHECK (construction_progress_percent IS NULL OR (construction_progress_percent >= 0 AND construction_progress_percent <= 100));
COMMENT ON COLUMN public.properties.construction_progress_percent IS 'For sale properties under construction: 0–100. NULL = not tracked or already completed.';
