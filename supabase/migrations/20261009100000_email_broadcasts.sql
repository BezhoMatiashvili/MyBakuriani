-- Admin email broadcasts (C33, C19), 2026-10-09.
--
-- /dashboard/admin/broadcast offered an "email" channel that only recorded a
-- broadcasts row: nothing was queued or sent, while the page said "sent to N".
-- The route now queues one email_outbound row per recipient (notification_type
-- 'broadcast', no notification row) for the dispatcher to send. Broadcasts are
-- marketing (Direct Marketing Policy v2), so only users with
-- profiles.marketing_email_consent = true are mailed.
--
--  (a) email_notification_priority: 'broadcast' is class 4, after every
--      transactional class. email_claim_batch already takes classes > 1 in
--      class order under the shared limit, so a broadcast never delays or uses
--      the class-1 reserve of transactional mail. Generated from the live body;
--      only the 'broadcast' branch is new.
--  (b) admin_broadcast_email_recipients(uuid[]): read-only, service_role only.
--      One row per distinct id with the address the trigger
--      email_enqueue_notification would use (lower(auth email), confirmed only)
--      and an outcome: ok | no_email | no_consent | suppressed.
--
-- 'broadcast' stays OUT of email_notification_types(): push broadcasts insert
-- type 'broadcast' notifications, and the enqueue trigger would mail them too.

CREATE OR REPLACE FUNCTION public.email_notification_priority(p_type text)
 RETURNS smallint
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  select case
    -- money moved, or a membership / payment-review decision
    when p_type = any (array[
      'payment_success', 'payment_refund', 'company_subscription',
      'membership_pending', 'membership_approved', 'membership_rejected',
      'admin_payment_review'
    ]) then 1
    -- other users (or the recipient) can trigger these at will
    when p_type = any (array[
      'payment_failed', 'job_application', 'smart_match_request', 'smart_match_offer',
      'org_membership_request', 'org_membership_response',
      'cleaning_task_new', 'cleaning_task_status', 'cleaning_task_cancelled',
      'cleaning_task_cancellation_requested',
      'admin_listing_pending', 'admin_content_change_pending', 'admin_company_pending',
      'admin_sms_pending'
    ]) then 3
    -- admin email broadcasts (marketing): after every transactional class
    when p_type = 'broadcast' then 4
    else 2
  end::smallint
$function$;
revoke all on function public.email_notification_priority(text) from public, anon, authenticated;
grant execute on function public.email_notification_priority(text) to service_role;

CREATE OR REPLACE FUNCTION public.admin_broadcast_email_recipients(p_user_ids uuid[])
 RETURNS TABLE(user_id uuid, email text, outcome text)
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select ids.id,
         case when u.email_confirmed_at is not null then lower(u.email) end,
         case
           when u.email is null or u.email_confirmed_at is null then 'no_email'
           when p.marketing_email_consent is not true then 'no_consent'
           when exists (select 1 from public.email_suppressions s
                         where s.email = lower(u.email)) then 'suppressed'
           else 'ok'
         end
    from (select distinct unnest(p_user_ids) as id) ids
    left join auth.users u on u.id = ids.id
    left join public.profiles p on p.id = ids.id
$function$;
revoke all on function public.admin_broadcast_email_recipients(uuid[]) from public, anon, authenticated;
grant execute on function public.admin_broadcast_email_recipients(uuid[]) to service_role;

notify pgrst, 'reload schema';
