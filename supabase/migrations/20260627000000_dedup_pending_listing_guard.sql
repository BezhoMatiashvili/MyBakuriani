-- Defense-in-depth backstop against duplicate 'pending' listings produced by a
-- rapid double-click on the create wizards. The real fix is the client-side
-- reentry guard in src/app/[locale]/create/* (submittingRef + keeping the submit
-- button disabled until router.push unmounts the page). This trigger is the DB
-- safety net for any path the client guard can't cover (e.g. a request that
-- errors on the client but commits server-side, then gets retried).
--
-- A BEFORE INSERT trigger is the only correct seam: the create pages insert
-- client-side, so the dedup has to live in the database to be authoritative.
-- RETURN NULL silently skips the duplicate row — the statement still reports
-- success, so the client redirects normally and the user is none the wiser.
--
-- Match key (only suppress a near-instant identical repeat):
--   services   -> owner_id + title + category   + status='pending' within 60s
--   properties -> owner_id + title + is_for_sale + status='pending' within 60s
--
-- The FIRST (legitimate) insert always passes — nothing matches yet — so a real
-- listing is created and uploaded successfully. Only the SECOND, near-instant
-- identical insert is dropped.
--
-- Why a time-windowed trigger and NOT a UNIQUE index: two legitimately distinct
-- listings can share owner_id+title; a hard unique (even partial on
-- status='pending') would reject them forever and surface a user-facing error.
-- The 60s window blocks accidental rapid repeats while letting deliberate
-- re-listings through.
--
-- CAVEAT (READ COMMITTED): two genuinely simultaneous (sub-millisecond) inserts
-- can each run the EXISTS check before the other's row is visible, so both can
-- pass. This trigger is therefore best-effort for that race; the client
-- submittingRef closes it on the originating tab. The observed production cases
-- were 2-4s apart and are fully covered here.

CREATE OR REPLACE FUNCTION public.skip_duplicate_pending_service()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.services s
    WHERE s.owner_id = NEW.owner_id
      AND s.title    = NEW.title
      AND s.category = NEW.category
      AND s.status   = 'pending'
      AND s.created_at > now() - interval '60 seconds'
  ) THEN
    RETURN NULL;  -- silently skip the duplicate insert
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.skip_duplicate_pending_property()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.properties p
    WHERE p.owner_id    = NEW.owner_id
      AND p.title       = NEW.title
      AND p.is_for_sale IS NOT DISTINCT FROM NEW.is_for_sale
      AND p.status      = 'pending'
      AND p.created_at  > now() - interval '60 seconds'
  ) THEN
    RETURN NULL;  -- silently skip the duplicate insert
  END IF;
  RETURN NEW;
END;
$$;

-- Trigger functions are invoked by the trigger mechanism under the definer's
-- privileges; clients never call them directly (matches the convention in
-- 20260626123000_revoke_execute_trigger_functions.sql).
REVOKE ALL ON FUNCTION public.skip_duplicate_pending_service()  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.skip_duplicate_pending_property() FROM PUBLIC, anon, authenticated;

-- Only guard pending inserts; edits use UPDATE and seeds insert status='active'.
DROP TRIGGER IF EXISTS trg_services_skip_dup_pending ON public.services;
CREATE TRIGGER trg_services_skip_dup_pending
  BEFORE INSERT ON public.services
  FOR EACH ROW
  WHEN (NEW.status = 'pending')
  EXECUTE FUNCTION public.skip_duplicate_pending_service();

DROP TRIGGER IF EXISTS trg_properties_skip_dup_pending ON public.properties;
CREATE TRIGGER trg_properties_skip_dup_pending
  BEFORE INSERT ON public.properties
  FOR EACH ROW
  WHEN (NEW.status = 'pending')
  EXECUTE FUNCTION public.skip_duplicate_pending_property();

-- ROLLBACK (apply manually to revert):
--   DROP TRIGGER IF EXISTS trg_services_skip_dup_pending   ON public.services;
--   DROP TRIGGER IF EXISTS trg_properties_skip_dup_pending ON public.properties;
--   DROP FUNCTION IF EXISTS public.skip_duplicate_pending_service();
--   DROP FUNCTION IF EXISTS public.skip_duplicate_pending_property();
