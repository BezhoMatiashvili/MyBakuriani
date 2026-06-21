-- Notify the listing owner when a new job application (CV submission) lands, so
-- the employer actually "receives" it: the in-app bell badge + notifications
-- page light up in real time (DashboardShell already subscribes to the
-- notifications table). Mirrors notify_listing_pending — a trigger is the only
-- correct seam because applications are inserted client-side (anon or the
-- applicant) and the notifications table has no client INSERT policy, so a
-- page-side insert would be rejected by RLS.
--
-- Non-destructive: only CREATEs a function + trigger.

CREATE OR REPLACE FUNCTION public.notify_job_application()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner_id UUID;
  v_category TEXT;
  v_title    TEXT;
  v_segment  TEXT;
BEGIN
  SELECT owner_id, category, title
    INTO v_owner_id, v_category, v_title
  FROM services
  WHERE id = NEW.service_id;

  IF v_owner_id IS NULL THEN
    RETURN NEW; -- listing gone (cascade race) — nothing to notify
  END IF;

  -- URL segment for the owner's service cabinet (applications today only come
  -- from employment listings; the CASE keeps it correct if that ever widens).
  v_segment := CASE v_category
    WHEN 'transport'     THEN 'transport'
    WHEN 'entertainment' THEN 'entertainment'
    WHEN 'handyman'      THEN 'services'
    ELSE 'employment'
  END;

  PERFORM public._notify(
    v_owner_id,
    'job_application',
    'ახალი განაცხადი ვაკანსიაზე',
    NEW.full_name || ' გამოეხმაურა თქვენს ვაკანსიას „' || COALESCE(v_title, '') || '"',
    '/dashboard/' || v_segment || '/orders'
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_job_application_notify ON public.job_applications;
CREATE TRIGGER trg_job_application_notify
  AFTER INSERT ON public.job_applications
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_job_application();
