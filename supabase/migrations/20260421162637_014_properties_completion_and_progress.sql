-- 014: additive columns on properties for seller UI parity
ALTER TABLE public.properties
  ADD COLUMN IF NOT EXISTS completion_year smallint,
  ADD COLUMN IF NOT EXISTS progress_note text,
  ADD COLUMN IF NOT EXISTS progress_note_updated_at timestamptz;
