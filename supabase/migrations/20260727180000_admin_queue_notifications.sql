-- Admin-facing notifications for the queues an administrator must action.
--
-- Until now NOTHING in this schema ever targeted an administrator: every writer
-- resolves its recipient from a row it already holds (owner_id, guest_id,
-- requester_id, cleaner_id). So `dashboard_scope = 'admin'` was in the CHECK
-- constraint and in the TS union, AdminTopbar subscribed to it, and no code path
-- could ever produce a row -- the admin bell was structurally empty.
--
-- This is also the FIRST admin enumeration in the schema. Every other
-- role = 'admin' reference is a self-check (id = auth.uid() AND role = 'admin')
-- used as an RLS predicate; this one deliberately reads the whole admin set,
-- which is why it is SECURITY DEFINER with a pinned empty search_path.

CREATE OR REPLACE FUNCTION public._notify_admins(
  p_type         text,
  p_title        text,
  p_message      text DEFAULT NULL,
  p_action_url   text DEFAULT NULL,
  p_exclude_user uuid DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  v_inserted integer;
BEGIN
  -- Set-based fan-out rather than a per-recipient loop, mirroring
  -- notify_owners_of_smart_match_request.
  --
  -- The NOT EXISTS is queue coalescing, keyed on (recipient, type, still unread).
  -- An admin work queue only needs ONE live "there is work" signal: the exact
  -- backlog already lives in the polled sidebar badge
  -- (/api/admin/listings/pending/count). Without this, listings alone would
  -- produce ~96 notifications/month against a bell that renders 8 items, burying
  -- the other three queues within a week. Keying on type is required, or a
  -- pending-SMS notice would suppress a pending-listing notice.
  --
  -- Consequence to know: while a notice is unread, later arrivals in that same
  -- queue are silent, so the message names the item that re-armed the signal
  -- rather than summarising the backlog. The action_url always lands on the full
  -- queue, so nothing is unreachable. Marking read re-arms the signal.
  INSERT INTO public.notifications (user_id, type, title, message, action_url, dashboard_scope)
  SELECT p.id, p_type, p_title, p_message, p_action_url, 'admin'
  FROM public.profiles p
  WHERE p.role = 'admin'
    AND (p_exclude_user IS NULL OR p.id <> p_exclude_user)
    AND NOT EXISTS (
      SELECT 1 FROM public.notifications n
      WHERE n.user_id = p.id
        AND n.type = p_type
        AND n.dashboard_scope = 'admin'
        AND n.is_read = false
    );
  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RETURN v_inserted;
END;
$fn$;

REVOKE ALL ON FUNCTION public._notify_admins(text, text, text, text, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._notify_admins(text, text, text, text, uuid)
  TO service_role;

-- 1. Pending listing moderation. The admin fan-out rides along with the existing
--    owner notification rather than adding a second trigger on the same event.
--
--    This also gains an EXCEPTION handler for the first time. notify_listing_pending
--    was the only one of the five sibling notify triggers without one, and it runs
--    inside the listing's own transaction -- so any failure here (including the new
--    fan-out) would abort the INSERT and lose the user's submission.
CREATE OR REPLACE FUNCTION public.notify_listing_pending()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_scope text;
  v_title text := COALESCE(NULLIF(NEW.title, ''), 'განცხადება');
BEGIN
  v_scope := CASE TG_TABLE_NAME
    WHEN 'properties' THEN CASE WHEN coalesce((to_jsonb(NEW)->>'is_for_sale')::boolean, false) THEN 'seller' ELSE 'renter' END
    WHEN 'services' THEN CASE to_jsonb(NEW)->>'category'
      WHEN 'food' THEN 'food' WHEN 'cleaning' THEN 'cleaner'
      WHEN 'employment' THEN 'employment' WHEN 'transport' THEN 'transport'
      WHEN 'entertainment' THEN 'entertainment' ELSE 'services' END
    ELSE NULL END;
  PERFORM public._notify(NEW.owner_id, 'listing_pending',
    'თქვენი განცხადება განხილვის პროცესშია',
    '„' || v_title || '" გადაეგზავნა ადმინისტრატორს დასადასტურებლად.',
    '/dashboard', v_scope);

  -- Excludes an admin submitting their own listing: they already received the
  -- owner-facing notice above, in their renter/seller cabinet.
  PERFORM public._notify_admins('admin_listing_pending',
    'ახალი განცხადება მოდერაციაზე',
    '„' || v_title || '" ელოდება ადმინისტრატორის დადასტურებას.',
    '/dashboard/admin/verifications',
    NEW.owner_id);

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'notify_listing_pending failed for % %: %', TG_TABLE_NAME, NEW.id, SQLERRM;
  RETURN NEW;
END;
$fn$;

-- 2. Pending editorial-review requests (C14). A trigger, not the API route: the
--    route has two write paths (plain INSERT and the 23505 UPDATE-replacement)
--    and only the INSERT is a newly actionable event.
CREATE OR REPLACE FUNCTION public.notify_admins_content_change_pending()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $fn$
DECLARE
  v_name  text;
  v_label text;
BEGIN
  IF NEW.status <> 'pending' THEN RETURN NEW; END IF;
  SELECT display_name INTO v_name FROM public.profiles WHERE id = NEW.requester_id;
  v_label := CASE NEW.target_type
    WHEN 'profile' THEN 'პროფილი' WHEN 'property' THEN 'განცხადება'
    WHEN 'service' THEN 'სერვისი'  WHEN 'organization' THEN 'კომპანია'
    ELSE 'კონტენტი' END;

  PERFORM public._notify_admins('admin_content_change_pending',
    'ახალი ცვლილება განსახილველად',
    format('%s ითხოვს ცვლილების დამტკიცებას (%s).', coalesce(v_name, 'მომხმარებელი'), v_label),
    '/dashboard/admin/verifications?tab=changes',
    NEW.requester_id);
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'notify_admins_content_change_pending failed for request %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$fn$;

REVOKE ALL ON FUNCTION public.notify_admins_content_change_pending()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_content_change_admin_notify ON public.content_change_requests;
CREATE TRIGGER trg_content_change_admin_notify
  AFTER INSERT ON public.content_change_requests
  FOR EACH ROW EXECUTE FUNCTION public.notify_admins_content_change_pending();

-- 3. Pending SMS broadcasts. One notice per broadcast, not per recipient.
--    The existing sender-facing notice in src/app/api/sms/broadcast/route.ts is
--    the correct counterpart and stays as is.
CREATE OR REPLACE FUNCTION public.notify_admins_sms_broadcast_pending()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $fn$
DECLARE v_name text;
BEGIN
  SELECT display_name INTO v_name FROM public.profiles WHERE id = NEW.sender_id;
  PERFORM public._notify_admins('admin_sms_pending',
    'SMS დაგზავნა ელოდება დადასტურებას',
    format('%s — %s SMS ელოდება შემოწმებას.', coalesce(v_name, 'მომხმარებელი'), NEW.recipient_count),
    '/dashboard/admin/sms-approvals',
    NEW.sender_id);
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'notify_admins_sms_broadcast_pending failed for broadcast %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$fn$;

REVOKE ALL ON FUNCTION public.notify_admins_sms_broadcast_pending()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_sms_broadcasts_admin_notify ON public.sms_broadcasts;
CREATE TRIGGER trg_sms_broadcasts_admin_notify
  AFTER INSERT ON public.sms_broadcasts
  FOR EACH ROW WHEN (NEW.status = 'pending')
  EXECUTE FUNCTION public.notify_admins_sms_broadcast_pending();

-- 4. Pending company verification. Distinct from the org MEMBERSHIP request in
--    20260627090200_org_rpcs.sql, which correctly targets the company owner.
CREATE OR REPLACE FUNCTION public.notify_admins_organization_pending()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $fn$
BEGIN
  PERFORM public._notify_admins('admin_company_pending',
    'ახალი კომპანია ვერიფიკაციაზე',
    format('„%s" ელოდება ვერიფიკაციას.', coalesce(nullif(btrim(NEW.brand_name), ''), 'კომპანია')),
    '/dashboard/admin/companies',
    NEW.owner_id);
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'notify_admins_organization_pending failed for org %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$fn$;

REVOKE ALL ON FUNCTION public.notify_admins_organization_pending()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_organizations_admin_notify ON public.organizations;
CREATE TRIGGER trg_organizations_admin_notify
  AFTER INSERT ON public.organizations
  FOR EACH ROW WHEN (NEW.status = 'pending')
  EXECUTE FUNCTION public.notify_admins_organization_pending();

-- Reviews and leads are deliberately NOT wired: neither has a pending-queue
-- semantic to notify about (reviews has no moderation status feeding a queue,
-- leads is owner-facing CRM). Inventing one is a separate product decision.
--
-- No backfill: all four fire on INSERT only, so existing pending work produces
-- nothing and the bell stays empty until the next submission.

NOTIFY pgrst, 'reload schema';
