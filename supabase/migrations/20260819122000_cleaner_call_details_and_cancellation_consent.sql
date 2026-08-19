-- Make a cleaner call-out's displayed terms match what is actually persisted,
-- and add a bilateral cancellation step once the cleaner has accepted it.
--
-- Lifecycle:
--   owner:   pending -> cancelled                    (withdraw before acceptance)
--   cleaner: pending -> accepted | declined
--   owner:   accepted -> cancellation_requested      (does not release the slot)
--   cleaner: cancellation_requested -> cancelled     (approve)
--                                          -> accepted (decline; keep the job)
--   cleaner: accepted -> in_progress -> completed

-- A call-out must retain the exact service terms selected at creation time.
-- Existing rows stay NULL rather than receiving a guessed historical service.
ALTER TABLE public.cleaning_tasks
  ADD COLUMN IF NOT EXISTS cleaner_service_id uuid
    REFERENCES public.services(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS service_title text,
  ADD COLUMN IF NOT EXISTS price_unit text;

CREATE INDEX IF NOT EXISTS idx_cleaning_tasks_cleaner_service
  ON public.cleaning_tasks(cleaner_service_id)
  WHERE cleaner_service_id IS NOT NULL;

ALTER TABLE public.cleaning_tasks
  DROP CONSTRAINT IF EXISTS cleaning_tasks_status_check;

ALTER TABLE public.cleaning_tasks
  ADD CONSTRAINT cleaning_tasks_status_check
  CHECK (status IN (
    'pending',
    'accepted',
    'cancellation_requested',
    'in_progress',
    'completed',
    'declined',
    'cancelled'
  )) NOT VALID;

-- Replacing the signature means dropping the five-argument function first;
-- keeping it beside a defaulted six-argument overload would make legacy
-- five-argument calls ambiguous.
DROP FUNCTION IF EXISTS public.create_cleaning_task(
  uuid, uuid, text, timestamptz, text
);

CREATE FUNCTION public.create_cleaning_task(
  p_property_id uuid,
  p_cleaner_service_id uuid,
  p_cleaning_type text,
  p_scheduled_at timestamptz,
  p_notes text DEFAULT NULL,
  p_address text DEFAULT NULL
) RETURNS public.cleaning_tasks
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_task public.cleaning_tasks;
  v_cleaner uuid;
  v_price numeric;
  v_price_unit text;
  v_service_title text;
  v_owner uuid;
  v_property_location text;
  v_address text;
BEGIN
  IF auth.uid() IS NULL
    OR p_scheduled_at < now()
    OR length(btrim(p_cleaning_type)) NOT BETWEEN 1 AND 80
    OR length(btrim(coalesce(p_address, ''))) > 300
  THEN
    RAISE EXCEPTION 'Invalid cleaning task' USING ERRCODE = '22023';
  END IF;

  SELECT owner_id, location
    INTO v_owner, v_property_location
  FROM public.properties
  WHERE id = p_property_id;

  IF v_owner IS NULL OR v_owner <> auth.uid() THEN
    RAISE EXCEPTION 'Property not owned by caller' USING ERRCODE = '42501';
  END IF;

  SELECT owner_id, price, price_unit, title
    INTO v_cleaner, v_price, v_price_unit, v_service_title
  FROM public.services
  WHERE id = p_cleaner_service_id
    AND category = 'cleaning'
    AND status = 'active';

  IF v_cleaner IS NULL THEN
    RAISE EXCEPTION 'Cleaner unavailable' USING ERRCODE = '22023';
  END IF;

  v_address := coalesce(
    nullif(btrim(p_address), ''),
    nullif(btrim(v_property_location), '')
  );

  INSERT INTO public.cleaning_tasks (
    property_id,
    owner_id,
    cleaner_id,
    cleaner_service_id,
    service_title,
    cleaning_type,
    scheduled_at,
    price,
    price_unit,
    address,
    notes
  ) VALUES (
    p_property_id,
    v_owner,
    v_cleaner,
    p_cleaner_service_id,
    v_service_title,
    btrim(p_cleaning_type),
    p_scheduled_at,
    v_price,
    v_price_unit,
    v_address,
    left(p_notes, 1000)
  )
  RETURNING * INTO v_task;

  RETURN v_task;
END;
$$;

REVOKE ALL ON FUNCTION public.create_cleaning_task(
  uuid, uuid, text, timestamptz, text, text
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_cleaning_task(
  uuid, uuid, text, timestamptz, text, text
) TO authenticated;

CREATE OR REPLACE FUNCTION public.transition_cleaning_task(
  p_task_id uuid,
  p_status text
) RETURNS public.cleaning_tasks
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_task public.cleaning_tasks;
  v_next text := lower(btrim(p_status));
BEGIN
  SELECT * INTO v_task
  FROM public.cleaning_tasks
  WHERE id = p_task_id
  FOR UPDATE;

  IF NOT FOUND OR auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Task not found' USING ERRCODE = '42501';
  END IF;

  IF (v_task.owner_id = auth.uid()
        AND v_task.status = 'pending'
        AND v_next = 'cancelled')
     OR (v_task.owner_id = auth.uid()
        AND v_task.status = 'accepted'
        AND v_next = 'cancellation_requested')
     OR (v_task.cleaner_id = auth.uid()
        AND v_task.status = 'pending'
        AND v_next IN ('accepted', 'declined'))
     OR (v_task.cleaner_id = auth.uid()
        AND v_task.status = 'cancellation_requested'
        AND v_next IN ('accepted', 'cancelled'))
     OR (v_task.cleaner_id = auth.uid()
        AND v_task.status = 'accepted'
        AND v_next = 'in_progress')
     OR (v_task.cleaner_id = auth.uid()
        AND v_task.status = 'in_progress'
        AND v_next = 'completed')
  THEN
    UPDATE public.cleaning_tasks
    SET status = v_next,
        started_at = CASE
          WHEN v_next = 'in_progress' THEN now()
          ELSE started_at
        END,
        completed_at = CASE
          WHEN v_next = 'completed' THEN now()
          ELSE completed_at
        END
    WHERE id = v_task.id
    RETURNING * INTO v_task;

    RETURN v_task;
  END IF;

  RAISE EXCEPTION 'Invalid task transition' USING ERRCODE = '42501';
END;
$$;

REVOKE ALL ON FUNCTION public.transition_cleaning_task(uuid, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.transition_cleaning_task(uuid, text)
  TO authenticated;

-- This historical trigger-function name is retained because the trigger already
-- depends on it. It now routes the owner's cancellation request to the cleaner
-- as well as routing cleaner decisions/progress back to the owner.
CREATE OR REPLACE FUNCTION public.notify_owner_of_task_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid;
  v_type text := 'cleaning_task_status';
  v_title text := 'დასუფთავების სტატუსი';
  v_msg text;
  v_action_url text;
  v_scope text;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  IF OLD.status = 'accepted' AND NEW.status = 'cancellation_requested' THEN
    v_user_id := NEW.cleaner_id;
    v_type := 'cleaning_task_cancellation_requested';
    v_title := 'გაუქმების მოთხოვნა';
    v_msg := 'მესაკუთრემ დადასტურებული გამოძახების გაუქმება მოითხოვა';
    v_action_url := '/dashboard/cleaner';
    v_scope := 'cleaner';
  ELSIF OLD.status = 'pending' AND NEW.status = 'cancelled' THEN
    v_user_id := NEW.cleaner_id;
    v_type := 'cleaning_task_cancelled';
    v_title := 'გამოძახება გაუქმდა';
    v_msg := 'მესაკუთრემ გამოძახება მიღებამდე გააუქმა';
    v_action_url := '/dashboard/cleaner';
    v_scope := 'cleaner';
  ELSE
    v_user_id := NEW.owner_id;
    v_action_url := '/dashboard/renter/cleaners';
    v_scope := 'renter';
    v_msg := CASE
      WHEN OLD.status = 'pending' AND NEW.status = 'accepted'
        THEN 'დამლაგებელმა დაადასტურა გამოძახება'
      WHEN NEW.status = 'declined'
        THEN 'დამლაგებელმა უარყო გამოძახება'
      WHEN OLD.status = 'cancellation_requested' AND NEW.status = 'cancelled'
        THEN 'დამლაგებელი დაეთანხმა გამოძახების გაუქმებას'
      WHEN OLD.status = 'cancellation_requested' AND NEW.status = 'accepted'
        THEN 'დამლაგებელი არ დაეთანხმა გაუქმებას — გამოძახება ძალაში რჩება'
      WHEN NEW.status = 'in_progress'
        THEN 'დასუფთავება დაიწყო'
      WHEN NEW.status = 'completed'
        THEN 'დასუფთავება დასრულდა'
      ELSE NULL
    END;
  END IF;

  IF v_user_id IS NULL OR v_msg IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.notifications (
    user_id,
    type,
    title,
    message,
    action_url,
    dashboard_scope
  ) VALUES (
    v_user_id,
    v_type,
    v_title,
    v_msg,
    v_action_url,
    v_scope
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'notify_owner_of_task_status failed for task %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.notify_owner_of_task_status()
  FROM PUBLIC, anon, authenticated;

-- A renter needs a stable cleaner identity even when that cleaner's listing is
-- later paused. Contact fields remain private until the cleaner has accepted;
-- a cancellation request does not hide them because the job is still active.
CREATE OR REPLACE FUNCTION public.get_my_cleaning_task_cleaner_details()
RETURNS TABLE (
  task_id uuid,
  cleaner_name text,
  cleaner_avatar_url text,
  phone text,
  whatsapp text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    task.id,
    COALESCE(
      NULLIF(btrim(concat_ws(' ', cleaner.first_name, cleaner.last_name)), ''),
      service.provider_name,
      profile.display_name,
      'დამლაგებელი'
    ),
    profile.avatar_url,
    CASE
      WHEN task.status IN (
        'accepted',
        'cancellation_requested',
        'in_progress',
        'completed'
      ) THEN COALESCE(cleaner.phone, service.phone, profile.phone)
      ELSE NULL
    END,
    CASE
      WHEN task.status IN (
        'accepted',
        'cancellation_requested',
        'in_progress',
        'completed'
      ) THEN COALESCE(cleaner.whatsapp, service.whatsapp)
      ELSE NULL
    END
  FROM public.cleaning_tasks AS task
  JOIN public.profiles AS profile ON profile.id = task.cleaner_id
  LEFT JOIN public.cleaner_profiles AS cleaner ON cleaner.id = task.cleaner_id
  LEFT JOIN LATERAL (
    SELECT
      candidate.provider_name,
      candidate.phone,
      candidate.whatsapp
    FROM public.services AS candidate
    WHERE candidate.owner_id = task.cleaner_id
      AND candidate.category = 'cleaning'
    ORDER BY
      (candidate.status = 'active') DESC,
      candidate.created_at DESC NULLS LAST,
      candidate.id
    LIMIT 1
  ) AS service ON true
  WHERE task.owner_id = auth.uid();
$$;

REVOKE ALL ON FUNCTION public.get_my_cleaning_task_cleaner_details()
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_cleaning_task_cleaner_details()
  TO authenticated;

NOTIFY pgrst, 'reload schema';
