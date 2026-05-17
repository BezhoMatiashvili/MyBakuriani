-- Adds moderation + AI tagging columns to reviews. Additive only; existing
-- 15 rows get status='approved' so they remain publicly visible.

ALTER TABLE public.reviews
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'approved',
  ADD COLUMN IF NOT EXISTS moderation_notes text,
  ADD COLUMN IF NOT EXISTS ai_sentiment text,
  ADD COLUMN IF NOT EXISTS ai_risk_tags jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS ai_analyzed_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS moderated_by uuid,
  ADD COLUMN IF NOT EXISTS moderated_at timestamp with time zone;

-- Constrain status to known values.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'reviews_status_check'
  ) THEN
    ALTER TABLE public.reviews
      ADD CONSTRAINT reviews_status_check
      CHECK (status IN ('pending','approved','hidden','removed'));
  END IF;
END$$;

-- Index to let admin quickly pull the moderation queue.
CREATE INDEX IF NOT EXISTS reviews_status_idx ON public.reviews (status);

-- FK for moderated_by.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'reviews_moderated_by_fkey'
  ) THEN
    ALTER TABLE public.reviews
      ADD CONSTRAINT reviews_moderated_by_fkey
      FOREIGN KEY (moderated_by) REFERENCES public.profiles(id);
  END IF;
END$$;

-- Admin-only UPDATE policy (preserves existing SELECT/INSERT).
DROP POLICY IF EXISTS "reviews admin update" ON public.reviews;
CREATE POLICY "reviews admin update" ON public.reviews
  FOR UPDATE
  TO authenticated
  USING (public.is_admin_user())
  WITH CHECK (public.is_admin_user());

-- Public SELECT should only show approved reviews; admins see all.
DROP POLICY IF EXISTS "reviews public read approved" ON public.reviews;
CREATE POLICY "reviews public read approved" ON public.reviews
  FOR SELECT
  USING (status = 'approved' OR public.is_admin_user());
