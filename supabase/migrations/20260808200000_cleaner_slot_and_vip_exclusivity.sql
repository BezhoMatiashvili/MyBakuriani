-- Enforce the two exclusivity rules called out in გასასწორებელი კიდე.pdf.
--
-- Cleaner jobs have no duration, so a collision means the same cleaner and the
-- exact same scheduled_at.  A trigger (rather than a unique index) is required
-- because the occupied rows live in two tables and legacy duplicates must keep
-- working until they are edited to a different time.

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
    -- legacy duplicates. Moving or reactivating a row is checked below.
    IF v_old_occupied
       AND OLD.cleaner_id IS NOT DISTINCT FROM NEW.cleaner_id
       AND OLD.scheduled_at IS NOT DISTINCT FROM NEW.scheduled_at THEN
      RETURN NEW;
    END IF;
  END IF;

  -- Serialize checks for the same cleaner/timestamp so concurrent inserts into
  -- different tables cannot both pass their existence checks.
  PERFORM pg_advisory_xact_lock(
    hashtextextended(
      NEW.cleaner_id::text || ':' || extract(epoch FROM NEW.scheduled_at)::text,
      0
    )
  );

  SELECT EXISTS (
    SELECT 1
    FROM public.cleaning_tasks AS platform
    WHERE platform.cleaner_id = NEW.cleaner_id
      AND platform.scheduled_at = NEW.scheduled_at
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
      AND manual.scheduled_at = NEW.scheduled_at
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

REVOKE ALL ON FUNCTION public.enforce_cleaner_schedule_slot()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS enforce_cleaner_schedule_slot ON public.cleaning_tasks;
CREATE TRIGGER enforce_cleaner_schedule_slot
  BEFORE INSERT OR UPDATE OF cleaner_id, scheduled_at, status
  ON public.cleaning_tasks
  FOR EACH ROW EXECUTE FUNCTION public.enforce_cleaner_schedule_slot();

DROP TRIGGER IF EXISTS enforce_cleaner_schedule_slot ON public.cleaner_manual_tasks;
CREATE TRIGGER enforce_cleaner_schedule_slot
  BEFORE INSERT OR UPDATE OF cleaner_id, scheduled_at, status
  ON public.cleaner_manual_tasks
  FOR EACH ROW EXECUTE FUNCTION public.enforce_cleaner_schedule_slot();

CREATE INDEX IF NOT EXISTS idx_cleaning_tasks_occupied_slot
  ON public.cleaning_tasks (cleaner_id, scheduled_at)
  WHERE cleaner_id IS NOT NULL
    AND coalesce(status, 'pending') NOT IN ('declined', 'cancelled');

-- SUPER VIP and standard VIP share vip_expires_at and therefore cannot be
-- independently active. Normalize historical dual flags in favor of SUPER VIP.
UPDATE public.properties
SET is_vip = false
WHERE is_vip IS TRUE AND is_super_vip IS TRUE;

UPDATE public.services
SET is_vip = false
WHERE is_vip IS TRUE AND is_super_vip IS TRUE;

CREATE OR REPLACE FUNCTION public.enforce_listing_vip_tier_exclusivity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_old_super_active boolean := false;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    v_old_super_active := OLD.is_super_vip IS TRUE
      AND (OLD.vip_expires_at IS NULL OR OLD.vip_expires_at > now());

    -- A standard-VIP purchase updates is_vip from false to true. Reject it
    -- while SUPER VIP is active; the surrounding RPC transaction then rolls
    -- back its balance debit, transaction row and notification atomically.
    IF v_old_super_active
       AND OLD.is_vip IS NOT TRUE
       AND NEW.is_vip IS TRUE THEN
      RAISE EXCEPTION 'vip_tier_conflict'
        USING ERRCODE = '23P01', CONSTRAINT = 'vip_tier_conflict';
    END IF;

    -- An expired SUPER VIP flag is stale metadata, not a blocker to buying VIP.
    IF OLD.is_super_vip IS TRUE
       AND NOT v_old_super_active
       AND NEW.is_vip IS TRUE THEN
      NEW.is_super_vip := false;
    END IF;
  END IF;

  -- SUPER VIP activation/renewal always wins immediately over standard VIP.
  IF NEW.is_super_vip IS TRUE AND NEW.is_vip IS TRUE THEN
    NEW.is_vip := false;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_listing_vip_tier_exclusivity()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS enforce_vip_tier_exclusivity ON public.properties;
CREATE TRIGGER enforce_vip_tier_exclusivity
  BEFORE INSERT OR UPDATE OF is_vip, is_super_vip, vip_expires_at
  ON public.properties
  FOR EACH ROW EXECUTE FUNCTION public.enforce_listing_vip_tier_exclusivity();

DROP TRIGGER IF EXISTS enforce_vip_tier_exclusivity ON public.services;
CREATE TRIGGER enforce_vip_tier_exclusivity
  BEFORE INSERT OR UPDATE OF is_vip, is_super_vip, vip_expires_at
  ON public.services
  FOR EACH ROW EXECUTE FUNCTION public.enforce_listing_vip_tier_exclusivity();

ALTER TABLE public.properties
  DROP CONSTRAINT IF EXISTS properties_vip_tier_exclusive;
ALTER TABLE public.properties
  ADD CONSTRAINT properties_vip_tier_exclusive
  CHECK (NOT (is_vip IS TRUE AND is_super_vip IS TRUE));

ALTER TABLE public.services
  DROP CONSTRAINT IF EXISTS services_vip_tier_exclusive;
ALTER TABLE public.services
  ADD CONSTRAINT services_vip_tier_exclusive
  CHECK (NOT (is_vip IS TRUE AND is_super_vip IS TRUE));

NOTIFY pgrst, 'reload schema';
