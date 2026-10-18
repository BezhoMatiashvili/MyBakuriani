-- Admin email broadcasts: service notices (C33), 2026-10-09.
--
-- /dashboard/admin/broadcast now sends an email broadcast as one of two kinds
-- (the owner's call 2026-10-09):
--   * offer / promotion  -> notification_type 'broadcast': marketing, only to
--     users with profiles.marketing_email_consent = true, marketing footer;
--   * service notice     -> notification_type 'service_broadcast': information
--     about the service or the account (maintenance, rule changes), to every
--     user with a confirmed, unsuppressed address whatever their marketing
--     choice, service footer.
--
--  (a) email_notification_priority: 'service_broadcast' is class 4 like
--      'broadcast', after every transactional class. Generated from the live
--      body; only the 'service_broadcast' line is new.
--  (b) admin_broadcast_email_recipients: 'suppressed' is now tested before
--      'no_consent', so a suppressed address is reported as suppressed whatever
--      its consent. The route mails 'ok' for an offer and 'ok' or 'no_consent'
--      for a service notice, so a suppressed address is never mailed either
--      way. Same signature; generated from the live body.
--
-- 'service_broadcast' stays OUT of email_notification_types(), like 'broadcast'.

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
    -- admin email service notices: after every transactional class
    when p_type = 'service_broadcast' then 4
    else 2
  end::smallint
$function$;
revoke all on function public.email_notification_priority(text) from public, anon, authenticated;
grant execute on function public.email_notification_priority(text) to service_role;

CREATE OR REPLACE FUNCTION public.admin_broadcast_email_recipients(p_user_ids uuid[])
 RETURNS TABLE(user_id uuid, email text, outcome text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select ids.id,
         case when u.email_confirmed_at is not null then lower(u.email) end,
         case
           when u.email is null or u.email_confirmed_at is null then 'no_email'
           when exists (select 1 from public.email_suppressions s
                         where s.email = lower(u.email)) then 'suppressed'
           when p.marketing_email_consent is not true then 'no_consent'
           else 'ok'
         end
    from (select distinct unnest(p_user_ids) as id) ids
    left join auth.users u on u.id = ids.id
    left join public.profiles p on p.id = ids.id
$function$;
revoke all on function public.admin_broadcast_email_recipients(uuid[]) from public, anon, authenticated;
grant execute on function public.admin_broadcast_email_recipients(uuid[]) to service_role;

notify pgrst, 'reload schema';
