-- S2 (S04/S13): priority classes and a fair share of the notification-email
-- budget (C33). email_notification_priority() gives every emailed type a class:
-- 1 = payment receipts/refunds and membership/payment-review decisions, 3 = types
-- other users can trigger at will, 2 = the rest. email_claim_batch claims by class
-- (FIFO within one) and takes a separate limit for classes 2-3, so the dispatcher
-- can keep part of the daily cap for class 1; class 3 is also capped per recipient.

-- ---------------------------------------------------------------------------
-- 1. Priority class per emailed notification type
-- ---------------------------------------------------------------------------
create or replace function public.email_notification_priority(p_type text)
returns smallint
language sql
immutable
set search_path = ''
as $$
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
    else 2
  end::smallint
$$;
revoke all on function public.email_notification_priority(text) from public, anon, authenticated;
grant execute on function public.email_notification_priority(text) to service_role;

-- ---------------------------------------------------------------------------
-- 2. Enqueue: class-3 email capped per recipient and type per day
--    (generated from the live definition; only the cap block is new)
-- ---------------------------------------------------------------------------
create index email_outbound_recipient_type_idx
  on public.email_outbound (user_id, notification_type, created_at);

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
    -- Class 3: at most 3 emails per recipient and type per rolling day. Only
    -- the email copy is skipped; the notification row itself is unaffected.
    if public.email_notification_priority(new.type) = 3
       and (select count(*) from public.email_outbound e
             where e.user_id = new.user_id
               and e.notification_type = new.type
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
      (notification_id, user_id, to_email, notification_type, subject, body, action_url, status)
    values
      (new.id, new.user_id, v_email, new.type, left(new.title, 200), left(new.message, 4000),
       new.action_url,
       case when exists (select 1 from public.email_suppressions s where s.email = v_email)
            then 'suppressed' else 'queued' end)
    on conflict (notification_id) do nothing;
  exception when others then
    raise warning 'email_enqueue_notification skipped %: % %', new.id, sqlstate, sqlerrm;
  end;
  return null;
end;
$function$;
revoke all on function public.email_enqueue_notification() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Claim by class. New optional argument, so the old two-argument call keeps
--    working (all classes, class 1 first) until the dispatcher sends it.
-- ---------------------------------------------------------------------------
drop function public.email_claim_batch(integer, uuid);

CREATE OR REPLACE FUNCTION public.email_claim_batch(p_limit integer, p_claim_token uuid, p_shared_limit integer DEFAULT NULL::integer)
 RETURNS TABLE(id uuid, to_email text, notification_type text, subject text, body text, action_url text, attempts integer)
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
              o.attempts, o.created_at
  )
  select k.id, k.to_email, k.notification_type, k.subject, k.body, k.action_url, k.attempts
    from claimed k
   order by public.email_notification_priority(k.notification_type), k.created_at;
end;
$function$;
revoke all on function public.email_claim_batch(integer, uuid, integer) from public, anon, authenticated;
grant execute on function public.email_claim_batch(integer, uuid, integer) to service_role;

notify pgrst, 'reload schema';
