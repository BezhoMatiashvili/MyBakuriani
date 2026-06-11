-- Cleaner dashboard + renter→cleaner call flow.
--
-- 1) cleaner_profiles: per-user cleaner settings (owner-only RLS).
-- 2) cleaning_tasks: additive columns + status CHECK + index for the
--    targeted call flow (renter picks a cleaner, cleaner accepts/declines).
-- 3) get_platform_cleaners(): renter-facing directory of active cleaning
--    providers (SECURITY DEFINER so is_online is readable without opening
--    cleaner_profiles RLS; personal_number/address are never exposed).
-- 4) Notification triggers mirroring the smart-match fan-out pattern
--    (SECURITY DEFINER, exception-swallowing so they can never roll back
--    the task insert/update itself).

-- 1) cleaner_profiles -------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.cleaner_profiles (
  id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  first_name TEXT,
  last_name TEXT,
  personal_number TEXT,
  address TEXT,
  phone TEXT,
  whatsapp TEXT,
  is_online BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.cleaner_profiles ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Cleaners manage own cleaner profile" ON public.cleaner_profiles
    FOR ALL USING (id = auth.uid()) WITH CHECK (id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2) cleaning_tasks extensions ----------------------------------------------

ALTER TABLE public.cleaning_tasks
  ADD COLUMN IF NOT EXISTS address TEXT,
  ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

-- NOT VALID: legacy rows may hold other status strings; only new writes are checked.
DO $$ BEGIN
  ALTER TABLE public.cleaning_tasks
    ADD CONSTRAINT cleaning_tasks_status_check
    CHECK (status IN ('pending','accepted','in_progress','completed','declined','cancelled'))
    NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_cleaning_tasks_cleaner_status
  ON public.cleaning_tasks(cleaner_id, status);

-- 3) Renter-facing platform-cleaner directory --------------------------------

CREATE OR REPLACE FUNCTION public.get_platform_cleaners()
RETURNS TABLE (
  service_id uuid,
  cleaner_id uuid,
  name text,
  avatar_url text,
  phone text,
  whatsapp text,
  price numeric,
  price_unit text,
  location text,
  photo text,
  is_online boolean
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT s.id,
         s.owner_id,
         COALESCE(NULLIF(btrim(concat_ws(' ', cp.first_name, cp.last_name)), ''),
                  s.provider_name, p.display_name),
         p.avatar_url,
         COALESCE(cp.phone, s.phone, p.phone),
         COALESCE(cp.whatsapp, s.whatsapp),
         s.price,
         s.price_unit,
         s.location,
         s.photos[1],
         COALESCE(cp.is_online, true)
  FROM public.services s
  JOIN public.profiles p ON p.id = s.owner_id
  LEFT JOIN public.cleaner_profiles cp ON cp.id = s.owner_id
  WHERE s.category = 'cleaning'
    AND s.status = 'active'
    AND s.owner_id <> auth.uid();
$$;

REVOKE ALL ON FUNCTION public.get_platform_cleaners() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_platform_cleaners() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_platform_cleaners() TO authenticated;

-- 4) Notification triggers ----------------------------------------------------

CREATE OR REPLACE FUNCTION public.notify_cleaner_of_new_task()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_title text;
BEGIN
  IF NEW.cleaner_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT pr.title INTO v_title FROM public.properties pr WHERE pr.id = NEW.property_id;

  BEGIN
    INSERT INTO public.notifications (user_id, type, title, message, action_url)
    VALUES (
      NEW.cleaner_id,
      'cleaning_task_new',
      'ახალი გამოძახება',
      COALESCE(v_title, 'ობიექტი') || ' • ' || to_char(NEW.scheduled_at, 'DD.MM HH24:MI'),
      '/dashboard/cleaner'
    );
  EXCEPTION WHEN OTHERS THEN
    -- Never let notification fan-out roll back the renter's call.
    RAISE WARNING 'notify_cleaner_of_new_task failed for task %: %', NEW.id, SQLERRM;
  END;

  RETURN NEW;
END;
$$;

-- Trigger functions must not be REST-callable (SECURITY DEFINER + anon/authenticated).
REVOKE ALL ON FUNCTION public.notify_cleaner_of_new_task() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.notify_cleaner_of_new_task() FROM anon;
REVOKE ALL ON FUNCTION public.notify_cleaner_of_new_task() FROM authenticated;

DROP TRIGGER IF EXISTS trg_notify_cleaner_new_task ON public.cleaning_tasks;
CREATE TRIGGER trg_notify_cleaner_new_task
  AFTER INSERT ON public.cleaning_tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_cleaner_of_new_task();

CREATE OR REPLACE FUNCTION public.notify_owner_of_task_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_msg text;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  v_msg := CASE NEW.status
    WHEN 'accepted'    THEN 'დამლაგებელმა დაადასტურა გამოძახება'
    WHEN 'declined'    THEN 'დამლაგებელმა უარყო გამოძახება'
    WHEN 'in_progress' THEN 'დასუფთავება დაიწყო'
    WHEN 'completed'   THEN 'დასუფთავება დასრულდა'
    ELSE NULL
  END;

  IF v_msg IS NULL THEN
    RETURN NEW;
  END IF;

  BEGIN
    INSERT INTO public.notifications (user_id, type, title, message, action_url)
    VALUES (
      NEW.owner_id,
      'cleaning_task_status',
      'დასუფთავების სტატუსი',
      v_msg,
      '/dashboard/renter/cleaners'
    );
  EXCEPTION WHEN OTHERS THEN
    -- Never let notification fan-out roll back the cleaner's status change.
    RAISE WARNING 'notify_owner_of_task_status failed for task %: %', NEW.id, SQLERRM;
  END;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.notify_owner_of_task_status() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.notify_owner_of_task_status() FROM anon;
REVOKE ALL ON FUNCTION public.notify_owner_of_task_status() FROM authenticated;

DROP TRIGGER IF EXISTS trg_notify_owner_task_status ON public.cleaning_tasks;
CREATE TRIGGER trg_notify_owner_task_status
  AFTER UPDATE ON public.cleaning_tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_owner_of_task_status();
