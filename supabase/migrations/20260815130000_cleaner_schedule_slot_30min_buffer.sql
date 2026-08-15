-- Widen the cleaner schedule-slot rule from "no exact-same timestamp" to "at
-- least 30 minutes between any two of a cleaner's jobs" (platform or manual).
-- Superseded predicate lived in 20260808200000_cleaner_slot_and_vip_exclusivity.sql.

CREATE OR REPLACE FUNCTION public.enforce_cleaner_schedule_slot()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_new_occupied boolean;
  v_old_occupied boolean := false;
  v_conflict boolean;
  v_old_id uuid := NULL;
BEGIN
  -- Platform requests reserve a slot immediately. Declined/cancelled requests
  -- release it. Manual jobs only have occupied statuses by schema contract.
  v_new_occupied := CASE
    WHEN TG_TABLE_NAME = 'cleaning_tasks'
      THEN coalesce(NEW.status, 'pending') NOT IN ('declined', 'cancelled')
    ELSE true
  END;

  IF NOT v_new_occupied OR NEW.cleaner_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    v_old_id := OLD.id;
    v_old_occupied := CASE
      WHEN TG_TABLE_NAME = 'cleaning_tasks'
        THEN coalesce(OLD.status, 'pending') NOT IN ('declined', 'cancelled')
      ELSE true
    END;

    -- Permit status-only progress on an existing slot, including preserved
    -- legacy near-duplicates. Moving or reactivating a row is checked below.
    IF v_old_occupied
       AND OLD.cleaner_id IS NOT DISTINCT FROM NEW.cleaner_id
       AND OLD.scheduled_at IS NOT DISTINCT FROM NEW.scheduled_at THEN
      RETURN NEW;
    END IF;
  END IF;

  -- Serialize per cleaner (not per timestamp): two concurrent inserts inside
  -- the same 30-minute window must not both pass their existence checks.
  PERFORM pg_advisory_xact_lock(
    hashtextextended('cleaner-slot:' || NEW.cleaner_id::text, 0)
  );

  SELECT EXISTS (
    SELECT 1
    FROM public.cleaning_tasks AS platform
    WHERE platform.cleaner_id = NEW.cleaner_id
      AND platform.scheduled_at > NEW.scheduled_at - interval '30 minutes'
      AND platform.scheduled_at < NEW.scheduled_at + interval '30 minutes'
      AND coalesce(platform.status, 'pending') NOT IN ('declined', 'cancelled')
      AND NOT (
        TG_TABLE_NAME = 'cleaning_tasks'
        AND v_old_id IS NOT NULL
        AND platform.id = v_old_id
      )
    UNION ALL
    SELECT 1
    FROM public.cleaner_manual_tasks AS manual
    WHERE manual.cleaner_id = NEW.cleaner_id
      AND manual.scheduled_at > NEW.scheduled_at - interval '30 minutes'
      AND manual.scheduled_at < NEW.scheduled_at + interval '30 minutes'
      AND NOT (
        TG_TABLE_NAME = 'cleaner_manual_tasks'
        AND v_old_id IS NOT NULL
        AND manual.id = v_old_id
      )
  ) INTO v_conflict;

  IF v_conflict THEN
    RAISE EXCEPTION 'cleaner_schedule_slot_conflict'
      USING ERRCODE = '23P01', CONSTRAINT = 'cleaner_schedule_slot_conflict';
  END IF;

  RETURN NEW;
END;
$$;

NOTIFY pgrst, 'reload schema';
