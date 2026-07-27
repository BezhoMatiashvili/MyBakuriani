-- Dashboard notifications are explicitly partitioned by their recipient-facing
-- cabinet. NULL is deliberately reserved for global/account-wide notices.
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS dashboard_scope text;

ALTER TABLE public.notifications
  DROP CONSTRAINT IF EXISTS notifications_dashboard_scope_check;

ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_dashboard_scope_check
  CHECK (dashboard_scope IS NULL OR dashboard_scope IN (
    'guest', 'renter', 'seller', 'food', 'cleaner', 'employment',
    'transport', 'entertainment', 'services', 'admin'
  ));

-- Exact-scope dashboard reads and unread counts. Existing rows intentionally
-- stay NULL: historical/global notices never appear inside a cabinet feed.
CREATE INDEX IF NOT EXISTS idx_notifications_user_scope_unread_created
  ON public.notifications (user_id, dashboard_scope, is_read, created_at DESC);

-- Add the scope as a SIXTH, DEFAULTED parameter and retire the five-argument
-- overload rather than keeping both.
--
-- Two hard Postgres constraints force this shape, both verified empirically:
--   1. A non-defaulted parameter may not follow a defaulted one (42P13), so
--      p_dashboard_scope must carry DEFAULT NULL.
--   2. With that default, keeping a separate five-argument overload makes every
--      existing five-argument call ambiguous at RUNTIME
--      (42725 "function public._notify(...) is not unique") — which would break
--      every legacy caller instead of preserving it.
-- Dropping the five-argument form is safe: pg_depend reports zero hard
-- dependencies on it, and plpgsql resolves callees late, so the existing
-- five-argument call sites bind to this function and default the scope to NULL
-- (global) exactly as before.
DROP FUNCTION IF EXISTS public._notify(UUID, TEXT, TEXT, TEXT, TEXT);

CREATE OR REPLACE FUNCTION public._notify(
  p_user_id UUID,
  p_type TEXT,
  p_title TEXT,
  p_message TEXT DEFAULT NULL,
  p_action_url TEXT DEFAULT NULL,
  p_dashboard_scope TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_user_id IS NULL THEN RETURN; END IF;
  INSERT INTO public.notifications (user_id, type, title, message, action_url, dashboard_scope)
  VALUES (p_user_id, p_type, p_title, p_message, p_action_url, p_dashboard_scope);
END;
$$;

REVOKE ALL ON FUNCTION public._notify(UUID, TEXT, TEXT, TEXT, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._notify(UUID, TEXT, TEXT, TEXT, TEXT, TEXT)
  TO service_role;

-- Older payment/company RPC bodies call the preserved five-argument helper.
-- Resolve their active, listing-targeted notifications at the database boundary
-- from the transaction reference rather than trusting a client-supplied scope.
CREATE OR REPLACE FUNCTION public.assign_notification_dashboard_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reference_id uuid;
  v_sale boolean;
  v_category text;
BEGIN
  IF NEW.dashboard_scope IS NOT NULL THEN RETURN NEW; END IF;

  IF NEW.type IN ('company_subscription', 'org_membership_request', 'org_membership_response', 'company_moderation')
    OR NEW.action_url LIKE '/dashboard/seller/%' THEN
    NEW.dashboard_scope := 'seller';
    RETURN NEW;
  END IF;

  IF NEW.type <> 'payment_success' THEN RETURN NEW; END IF;
  SELECT reference_id INTO v_reference_id
  FROM public.transactions
  WHERE user_id = NEW.user_id AND reference_id IS NOT NULL
  ORDER BY created_at DESC, id DESC
  LIMIT 1;
  IF v_reference_id IS NULL THEN RETURN NEW; END IF;

  SELECT is_for_sale INTO v_sale FROM public.properties
  WHERE id = v_reference_id AND owner_id = NEW.user_id;
  IF FOUND THEN
    NEW.dashboard_scope := CASE WHEN v_sale THEN 'seller' ELSE 'renter' END;
    RETURN NEW;
  END IF;
  SELECT category INTO v_category FROM public.services
  WHERE id = v_reference_id AND owner_id = NEW.user_id;
  IF FOUND THEN
    NEW.dashboard_scope := CASE v_category
      WHEN 'food' THEN 'food' WHEN 'cleaning' THEN 'cleaner'
      WHEN 'employment' THEN 'employment' WHEN 'transport' THEN 'transport'
      WHEN 'entertainment' THEN 'entertainment' ELSE 'services' END;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_assign_notification_dashboard_scope ON public.notifications;
CREATE TRIGGER trg_assign_notification_dashboard_scope
  BEFORE INSERT ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION public.assign_notification_dashboard_scope();

-- Scope the existing trigger writers without modifying historical rows.
CREATE OR REPLACE FUNCTION public.notify_listing_pending()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_scope text;
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
    '„' || COALESCE(NULLIF(NEW.title, ''), 'განცხადება') || '" გადაეგზავნა ადმინისტრატორს დასადასტურებლად.',
    '/dashboard', v_scope);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_owners_of_smart_match_request()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_zone text; v_dates text; v_message text;
BEGIN
  IF NEW.status IS DISTINCT FROM 'active' THEN RETURN NEW; END IF;
  v_zone := COALESCE(NULLIF(btrim(NEW.zone), ''), 'ბაკურიანი');
  v_dates := CASE WHEN NEW.check_in IS NOT NULL AND NEW.check_out IS NOT NULL
    THEN ' ' || to_char(NEW.check_in, 'DD.MM') || ' – ' || to_char(NEW.check_out, 'DD.MM') ELSE '' END;
  v_message := 'სტუმარი ეძებს ' || v_zone || '-ში' || v_dates;
  INSERT INTO public.notifications (user_id, type, title, message, action_url, dashboard_scope)
  SELECT DISTINCT p.owner_id, 'smart_match_request', 'ახალი Smart Match მოთხოვნა',
    v_message, '/dashboard/renter/smart-match', 'renter'
  FROM public.properties p
  WHERE p.status = 'active' AND p.is_for_sale = false AND p.owner_id IS NOT NULL
    AND p.owner_id <> NEW.guest_id;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'notify_owners_of_smart_match_request failed for request %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_guest_of_smart_match_offer()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_guest_id uuid; v_price text;
BEGIN
  SELECT guest_id INTO v_guest_id FROM public.smart_match_requests WHERE id = NEW.request_id;
  IF v_guest_id IS NULL THEN RETURN NEW; END IF;
  v_price := trim(trailing '.' FROM trim(trailing '0' FROM to_char(NEW.offered_price, 'FM999999990.00')));
  INSERT INTO public.notifications (user_id, type, title, message, action_url, dashboard_scope)
  VALUES (v_guest_id, 'smart_match_offer', 'ახალი შეთავაზება',
    'მფლობელმა შემოგთავაზათ ობიექტი ფასით ' || v_price || '₾', '/dashboard/guest', 'guest');
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'notify_guest_of_smart_match_offer failed for offer %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_cleaner_of_new_task()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_title text;
BEGIN
  IF NEW.cleaner_id IS NULL THEN RETURN NEW; END IF;
  SELECT title INTO v_title FROM public.properties WHERE id = NEW.property_id;
  INSERT INTO public.notifications (user_id, type, title, message, action_url, dashboard_scope)
  VALUES (NEW.cleaner_id, 'cleaning_task_new', 'ახალი გამოძახება',
    COALESCE(v_title, 'ობიექტი') || ' • ' || to_char(NEW.scheduled_at, 'DD.MM HH24:MI'),
    '/dashboard/cleaner', 'cleaner');
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'notify_cleaner_of_new_task failed for task %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_owner_of_task_status()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_msg text;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;
  v_msg := CASE NEW.status WHEN 'accepted' THEN 'დამლაგებელმა დაადასტურა გამოძახება'
    WHEN 'declined' THEN 'დამლაგებელმა უარყო გამოძახება'
    WHEN 'in_progress' THEN 'დასუფთავება დაიწყო' WHEN 'completed' THEN 'დასუფთავება დასრულდა' END;
  IF v_msg IS NULL THEN RETURN NEW; END IF;
  INSERT INTO public.notifications (user_id, type, title, message, action_url, dashboard_scope)
  VALUES (NEW.owner_id, 'cleaning_task_status', 'დასუფთავების სტატუსი', v_msg,
    '/dashboard/renter/cleaners', 'renter');
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'notify_owner_of_task_status failed for task %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_job_application()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_owner_id uuid; v_category text; v_title text; v_scope text; v_segment text;
BEGIN
  SELECT owner_id, category, title INTO v_owner_id, v_category, v_title FROM public.services WHERE id = NEW.service_id;
  IF v_owner_id IS NULL THEN RETURN NEW; END IF;
  v_scope := CASE v_category WHEN 'food' THEN 'food' WHEN 'cleaning' THEN 'cleaner'
    WHEN 'transport' THEN 'transport' WHEN 'entertainment' THEN 'entertainment'
    WHEN 'employment' THEN 'employment' ELSE 'services' END;
  v_segment := v_scope;
  PERFORM public._notify(v_owner_id, 'job_application', 'ახალი განაცხადი ვაკანსიაზე',
    NEW.full_name || ' გამოეხმაურა თქვენს ვაკანსიას „' || COALESCE(v_title, '') || '"',
    '/dashboard/' || v_segment || '/orders', v_scope);
  RETURN NEW;
END;
$$;

-- Per-cabinet layout badges; global (NULL) notices are intentionally excluded.
CREATE OR REPLACE FUNCTION public.dashboard_layout_data()
RETURNS jsonb LANGUAGE sql STABLE SET search_path TO 'public' AS $function$
  select jsonb_build_object(
    'unread_counts', coalesce((select jsonb_object_agg(scope, count)
      from (select dashboard_scope as scope, count(*)::int as count from public.notifications
        where user_id = auth.uid() and is_read = false and dashboard_scope is not null
        group by dashboard_scope) scoped), '{}'::jsonb),
    'smart_match_actionable', public.smart_match_actionable_count(),
    'balance_amount', (select amount from public.balances where user_id = auth.uid()),
    'sms_remaining', (select sms_remaining from public.balances where user_id = auth.uid()),
    'is_for_sale_flags', coalesce((select jsonb_agg(coalesce(is_for_sale, false)) from public.properties where owner_id = auth.uid()), '[]'::jsonb),
    'service_categories', coalesce((select jsonb_agg(category) from public.services where owner_id = auth.uid()), '[]'::jsonb),
    'cleaning_tasks_count', (select count(*) from public.cleaning_tasks where cleaner_id = auth.uid()),
    'cleaner_online', (select is_online from public.cleaner_profiles where id = auth.uid()),
    'organizations', coalesce((select jsonb_agg(jsonb_build_object('id', o.id, 'name', o.brand_name, 'role', m.role, 'status', o.status) order by o.created_at)
      from public.organization_members m join public.organizations o on o.id = m.organization_id
      where m.user_id = auth.uid() and m.status = 'approved'), '[]'::jsonb)
  );
$function$;

notify pgrst, 'reload schema';
