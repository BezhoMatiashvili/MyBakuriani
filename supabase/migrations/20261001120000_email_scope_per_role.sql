-- Email follows the notification's cabinet (C33 / C19). A user can hold several
-- roles; their emails are per user_id, but three gaps made them role-blind:
--  (a) the dispatcher could not route a bare '/dashboard' link to the right
--      cabinet: email_outbound now carries dashboard_scope (copied from the
--      notification, which trg_assign_notification_dashboard_scope has already
--      stamped) and email_claim_batch returns it;
--  (b) the class-3 cap (3 per recipient and type per rolling day) is now keyed
--      per (user, type, scope) and counts only queued / sending / sent rows, so
--      one role's events or never-delivered rows do not starve another's;
--  (c) 'verification' (written by /api/admin/verifications/moderate) is emailed.
-- email_enqueue_notification, email_notification_types and email_claim_batch
-- are generated from the live definitions; only the marked parts are new.
-- email_claim_batch keeps its three-argument signature; the new trailing column
-- is ignored by a dispatcher that does not read it yet.

alter table public.email_outbound
  add column if not exists dashboard_scope text;
alter table public.email_outbound
  add constraint email_outbound_dashboard_scope_check
  check (dashboard_scope is null or dashboard_scope = any (array[
    'guest', 'renter', 'seller', 'food', 'cleaner',
    'employment', 'transport', 'entertainment', 'services', 'admin'
  ]));

CREATE OR REPLACE FUNCTION public.email_enqueue_notification()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_email text;
begin
  if not (new.type = any (public.email_notification_types())) then
    return null;
  end if;

  begin
    -- Class 3: at most 3 emails per recipient, type AND cabinet (dashboard_scope)
    -- per rolling day, so one role's events cannot starve another role's. Only
    -- rows that are or were really going out count (queued, sending, sent), so
    -- failed / suppressed / cancelled rows never use up the allowance. Only the
    -- email copy is skipped; the notification row itself is unaffected.
    if public.email_notification_priority(new.type) = 3
       and (select count(*) from public.email_outbound e
             where e.user_id = new.user_id
               and e.notification_type = new.type
               and e.dashboard_scope is not distinct from new.dashboard_scope
               and e.status in ('queued', 'sending', 'sent')
               and e.created_at > now() - interval '1 day') >= 3 then
      return null;
    end if;

    select lower(u.email) into v_email
      from auth.users u
     where u.id = new.user_id
       and u.email is not null
       and u.email_confirmed_at is not null;

    if v_email is null then
      return null;
    end if;

    insert into public.email_outbound
      (notification_id, user_id, to_email, notification_type, subject, body, action_url, status, dashboard_scope)
    values
      (new.id, new.user_id, v_email, new.type, left(new.title, 200), left(new.message, 4000),
       new.action_url,
       case when exists (select 1 from public.email_suppressions s where s.email = v_email)
            then 'suppressed' else 'queued' end,
       new.dashboard_scope)
    on conflict (notification_id) do nothing;
  exception when others then
    raise warning 'email_enqueue_notification skipped %: % %', new.id, sqlstate, sqlerrm;
  end;
  return null;
end;
$function$;
revoke all on function public.email_enqueue_notification() from public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.email_notification_types()
 RETURNS text[]
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  select array[
    -- money & membership
    'payment_success', 'payment_failed', 'payment_refund', 'payment_required',
    'membership_pending', 'membership_approved', 'membership_rejected',
    'vip_expiring', 'company_subscription',
    -- listing moderation
    'listing_moderation', 'content_change_approved', 'content_change_rejected',
    'company_moderation', 'verification',
    -- work requests
    'cleaning_task_new', 'cleaning_task_status', 'cleaning_task_cancellation_requested',
    'cleaning_task_cancelled', 'smart_match_request', 'smart_match_offer',
    'job_application', 'org_membership_request', 'org_membership_response',
    -- admin queues
    'admin_listing_pending', 'admin_content_change_pending', 'admin_membership_pending',
    'admin_payment_review', 'admin_company_pending', 'admin_sms_pending'
  ]::text[]
$function$;

drop function public.email_claim_batch(integer, uuid, integer);

CREATE OR REPLACE FUNCTION public.email_claim_batch(p_limit integer, p_claim_token uuid, p_shared_limit integer DEFAULT NULL::integer)
 RETURNS TABLE(id uuid, to_email text, notification_type text, subject text, body text, action_url text, attempts integer, dashboard_scope text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_ids uuid[];
begin
  if p_limit is null or p_limit < 1 or p_limit > 100 or p_claim_token is null
     or p_shared_limit < 0 then
    raise exception 'invalid_claim_args' using errcode = '22023';
  end if;

  update public.email_outbound o
     set status = 'cancelled', last_error = 'expired', claim_token = null
   where o.status in ('queued', 'sending')
     and o.created_at < now() - interval '3 days';

  update public.email_outbound o
     set status = 'suppressed', claim_token = null
   where o.status = 'queued'
     and exists (select 1 from public.email_suppressions s where s.email = o.to_email);

  -- Class 1 first, then class 2, then class 3; oldest first within a class.
  -- At most p_shared_limit rows of classes 2-3 (NULL: no separate limit), so
  -- the dispatcher can keep the rest of the day's cap for class 1.
  select coalesce(array_agg(d.id), '{}') into v_ids
    from (select c.id from public.email_outbound c
           where ((c.status = 'queued' and c.next_attempt_at <= now())
               or (c.status = 'sending' and c.claimed_at < now() - interval '10 minutes'))
             and public.email_notification_priority(c.notification_type) = 1
           order by c.created_at
           limit p_limit
           for update skip locked) d;

  if cardinality(v_ids) < p_limit then
    select v_ids || coalesce(array_agg(d.id), '{}') into v_ids
      from (select c.id from public.email_outbound c
             where ((c.status = 'queued' and c.next_attempt_at <= now())
                 or (c.status = 'sending' and c.claimed_at < now() - interval '10 minutes'))
               and public.email_notification_priority(c.notification_type) > 1
             order by public.email_notification_priority(c.notification_type), c.created_at
             limit least(p_limit - cardinality(v_ids), coalesce(p_shared_limit, p_limit))
             for update skip locked) d;
  end if;

  return query
  with claimed as (
    update public.email_outbound o
       set status = 'sending', claim_token = p_claim_token, claimed_at = now(),
           attempts = o.attempts + 1
     where o.id = any (v_ids)
    returning o.id, o.to_email, o.notification_type, o.subject, o.body, o.action_url,
              o.attempts, o.created_at, o.dashboard_scope
  )
  select k.id, k.to_email, k.notification_type, k.subject, k.body, k.action_url, k.attempts,
         k.dashboard_scope
    from claimed k
   order by public.email_notification_priority(k.notification_type), k.created_at;
end;
$function$;
revoke all on function public.email_claim_batch(integer, uuid, integer) from public, anon, authenticated;
grant execute on function public.email_claim_batch(integer, uuid, integer) to service_role;

notify pgrst, 'reload schema';
