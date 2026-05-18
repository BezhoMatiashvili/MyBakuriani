-- Extend notifications with severity + broadcast linkage
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS severity text NOT NULL DEFAULT 'info'
    CHECK (severity IN ('info','warning','critical'));

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS broadcast_id uuid
    REFERENCES public.broadcasts(id) ON DELETE SET NULL;

-- Partial index for the critical-unread modal gate query
CREATE INDEX IF NOT EXISTS idx_notifications_user_critical_unread
  ON public.notifications (user_id, created_at DESC)
  WHERE severity = 'critical' AND is_read = false;

-- Extend broadcasts with severity + flexible targeting + explicit title
ALTER TABLE public.broadcasts
  ADD COLUMN IF NOT EXISTS severity text NOT NULL DEFAULT 'info'
    CHECK (severity IN ('info','warning','critical'));

ALTER TABLE public.broadcasts
  ADD COLUMN IF NOT EXISTS target_roles text[] NULL;

ALTER TABLE public.broadcasts
  ADD COLUMN IF NOT EXISTS target_user_ids uuid[] NULL;

ALTER TABLE public.broadcasts
  ADD COLUMN IF NOT EXISTS title text NULL;
