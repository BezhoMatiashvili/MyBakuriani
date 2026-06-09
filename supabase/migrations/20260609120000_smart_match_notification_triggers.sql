-- Smart Match notification triggers
--
-- Replaces the fragile client-side notification fan-out with DB-side AFTER INSERT
-- triggers (server-driven "webhook" data flow). Both functions are SECURITY DEFINER
-- and owned by `postgres`; because public.notifications has rls_forced = false, the
-- table owner is exempt from RLS, so these inserts bypass the restrictive
-- "Smart match notifications insert" policy (which is unsatisfiable from a trigger
-- where auth.uid() is null). Notification failures are swallowed (RAISE WARNING) so
-- they can never roll back the originating request/offer.
--
-- DOWN / rollback (run manually if reverting — you MUST also re-add the client-side
-- notification inserts in guest/page.tsx and renter/smart-match/page.tsx, or
-- notifications stop entirely):
--   DROP TRIGGER IF EXISTS trg_notify_owners_smart_match_request ON public.smart_match_requests;
--   DROP TRIGGER IF EXISTS trg_notify_guest_smart_match_offer ON public.smart_match_offers;
--   DROP FUNCTION IF EXISTS public.notify_owners_of_smart_match_request();
--   DROP FUNCTION IF EXISTS public.notify_guest_of_smart_match_offer();

-- === Request fan-out: notify every distinct owner of an active, non-sale rental ===
CREATE OR REPLACE FUNCTION public.notify_owners_of_smart_match_request()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_zone text;
  v_dates text;
  v_message text;
BEGIN
  -- Only fan out for live requests.
  IF NEW.status IS DISTINCT FROM 'active' THEN
    RETURN NEW;
  END IF;

  v_zone := COALESCE(NULLIF(btrim(NEW.zone), ''), 'ბაკურიანი');

  IF NEW.check_in IS NOT NULL AND NEW.check_out IS NOT NULL THEN
    v_dates := ' ' || to_char(NEW.check_in, 'DD.MM') || ' – ' || to_char(NEW.check_out, 'DD.MM');
  ELSE
    v_dates := '';
  END IF;

  v_message := 'სტუმარი ეძებს ' || v_zone || '-ში' || v_dates;

  BEGIN
    INSERT INTO public.notifications (user_id, type, title, message, action_url)
    SELECT DISTINCT p.owner_id,
           'smart_match_request',
           'ახალი Smart Match მოთხოვნა',
           v_message,
           '/dashboard/renter/smart-match'
    FROM public.properties p
    WHERE p.status = 'active'
      AND p.is_for_sale = false
      AND p.owner_id IS NOT NULL
      AND p.owner_id <> NEW.guest_id;
  EXCEPTION WHEN OTHERS THEN
    -- Never let notification fan-out roll back the guest's request.
    RAISE WARNING 'notify_owners_of_smart_match_request failed for request %: %', NEW.id, SQLERRM;
  END;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_owners_smart_match_request ON public.smart_match_requests;
CREATE TRIGGER trg_notify_owners_smart_match_request
  AFTER INSERT ON public.smart_match_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_owners_of_smart_match_request();


-- === Offer notification: notify the request's guest ===
CREATE OR REPLACE FUNCTION public.notify_guest_of_smart_match_offer()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_guest_id uuid;
  v_price text;
BEGIN
  SELECT r.guest_id INTO v_guest_id
  FROM public.smart_match_requests r
  WHERE r.id = NEW.request_id;

  IF v_guest_id IS NULL THEN
    RETURN NEW;  -- request gone / no guest; nothing to notify.
  END IF;

  -- Trim a trailing ".00" / ".X0" so prices read cleanly in the Georgian UI.
  v_price := trim(trailing '.' FROM trim(trailing '0' FROM to_char(NEW.offered_price, 'FM999999990.00')));

  BEGIN
    INSERT INTO public.notifications (user_id, type, title, message, action_url)
    VALUES (
      v_guest_id,
      'smart_match_offer',
      'ახალი შეთავაზება',
      'მფლობელმა შემოგთავაზათ ობიექტი ფასით ' || v_price || '₾',
      '/dashboard/guest'
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'notify_guest_of_smart_match_offer failed for offer %: %', NEW.id, SQLERRM;
  END;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_guest_smart_match_offer ON public.smart_match_offers;
CREATE TRIGGER trg_notify_guest_smart_match_offer
  AFTER INSERT ON public.smart_match_offers
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_guest_of_smart_match_offer();
