-- Class-3 e-mail cap: one enqueue at a time per recipient, type and cabinet
-- (2026-10-15, C33).
--
-- email_enqueue_notification() (AFTER INSERT trigger on notifications) sends at
-- most 3 class-3 e-mails per recipient, type and cabinet per rolling day. It
-- counted email_outbound rows and then inserted with no lock, so concurrent
-- notices (simultaneous job applications to one employer, Smart Match offers or
-- requests, membership requests from several accounts) each counted before the
-- others committed and all passed: a recipient got more than 3. The count now
-- runs under a transaction advisory lock on that key, so a second notice waits
-- for the first to commit and counts it (a PL/pgSQL statement takes a new
-- snapshot after the lock is granted). A wait is capped at 1 s, and at 1 ms once
-- the statement has run 2 s (a fan-out such as a Smart Match request to every
-- rental owner), so the locks add at most about 3 s to any statement, inside the
-- 8 s statement_timeout of the API roles (a 57014 cancel would escape the
-- handler and fail the notification insert). A timeout (55P03) or deadlock
-- (40P01) is caught by the existing handler and skips only that e-mail.
-- lock_timeout is set for the lock call only and restored (an error inside the
-- block rolls the setting back with the subtransaction). Classes 1, 2 and 4 take
-- no lock; a transaction that notifies one key several times holds the lock once
-- (re-entrant). Legit notices, the cap and its window are as before.
--
-- Body = the live staging definition with the lock added; the guard refuses
-- (55000) where the live body differs. CREATE OR REPLACE keeps the function's ACL
-- and the trigger.

do $guard$
declare
  v_live text;
begin
  select md5(p.prosrc) into v_live
    from pg_proc p
   where p.oid = to_regprocedure('public.email_enqueue_notification()');
  if v_live is distinct from '5dd99598cb32d9f74cc12871e02aedae' then
    raise exception 'email_class3_cap_lock: email_enqueue_notification() differs from the reviewed body (md5 %); regenerate this migration from the live definition', v_live
      using errcode = '55000';
  end if;
end
$guard$;

CREATE OR REPLACE FUNCTION public.email_enqueue_notification()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_email text;
  v_lock_timeout text;
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
    -- The class-3 count runs under a lock on the cap's own key (recipient, type
    -- and cabinet), held until commit: without it, concurrent notices each
    -- counted before the others committed and all passed the cap. A wait is
    -- capped at 1 s, and at 1 ms once the statement has run 2 s (a fan-out to
    -- many recipients); a timeout skips only this e-mail (the handler below)
    -- and the notification insert never nears the 8 s statement_timeout.
    if public.email_notification_priority(new.type) = 3 then
      v_lock_timeout := current_setting('lock_timeout');
      perform set_config('lock_timeout',
        case when clock_timestamp() - statement_timestamp() < interval '2 seconds'
             then '1s' else '1ms' end, true);
      perform pg_advisory_xact_lock(hashtextextended(
        'email-class3:' || new.user_id::text || ':' || new.type || ':' || coalesce(new.dashboard_scope, '-'), 0));
      perform set_config('lock_timeout', v_lock_timeout, true);
    end if;

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
