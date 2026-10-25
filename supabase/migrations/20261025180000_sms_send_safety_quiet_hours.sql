-- SMS send safety, delivery history and check-in quiet hours (owner's technical task 2026-10-25; C18).
--
-- 1. A text that may have reached uBill is never sent twice. sms-dispatch stamps send_started_at
--    (sms_mark_send_started) right before calling uBill; the claim never hands out a stamped row; a
--    stamped row still approved after the 15-minute lease is failed {error: in_doubt, outcome: unknown},
--    uncharged (sms_fail_in_doubt_sends). A released row (uBill refused, nothing sent) is unstamped and
--    waits 1, 2, 4 ... 60 minutes by attempt before the next try; its expiry still ends the retries.
-- 2. sms_outbound_events: append-only history of every status change (trigger) and of every uBill
--    report the poll reads (sms_record_provider_report). sms_outbound_delivery_v names each row's state
--    queued / accepted / sent / delivered / undelivered / failed / unknown (reconciliation report).
--    Credit rules are unchanged: refunds only on report 2/4, never on a timeout or an unknown state.
-- 3. Check-in texts go out only 09:00-21:00 Tbilisi (the claim; = CHECK_IN_SEND_WINDOW in
--    sms-automation-run/domain.ts). The recheck keeps a check-in-day row when the first day it could go
--    out is the check-in day, drops it once check-in has started, and names why: booking_cancelled,
--    check_in_started, marketing_paused, else eligibility_changed.
-- 4. Marketing gates: site_settings key sms_marketing_gates {"consent_requests": bool, "win_back": bool}.
--    Anything but true (or no row) = paused until the lawyer approves; queued rows fail marketing_paused.
-- Order: this migration, then sms-dispatch (calls the new RPCs).

do $guard$
declare v text;
begin
  select md5(prosrc) into v from pg_proc where oid = 'public.sms_claim_dispatch_batch(uuid,integer)'::regprocedure;
  if v is distinct from 'ca943b7f90a4f546c8b95ef50cf192e4' then
    raise exception 'sms_send_safety: public.sms_claim_dispatch_batch(uuid,integer) differs from the reviewed body (md5 %); regenerate this migration from the live definition', v
      using errcode = '55000';
  end if;
  select md5(prosrc) into v from pg_proc where oid = 'public.sms_release_dispatch_claim(uuid,uuid)'::regprocedure;
  if v is distinct from '73815e99b61fd450b6d5bd6b4842573e' then
    raise exception 'sms_send_safety: public.sms_release_dispatch_claim(uuid,uuid) differs from the reviewed body (md5 %); regenerate this migration from the live definition', v
      using errcode = '55000';
  end if;
  select md5(prosrc) into v from pg_proc where oid = 'public.sms_cancel_ineligible_automation()'::regprocedure;
  if v is distinct from '1e2c0e067376dc67b9bd155fe1cef8e6' then
    raise exception 'sms_send_safety: public.sms_cancel_ineligible_automation() differs from the reviewed body (md5 %); regenerate this migration from the live definition', v
      using errcode = '55000';
  end if;
end
$guard$;

alter table public.sms_outbound
  add column if not exists send_started_at timestamptz,
  add column if not exists provider_checked_at timestamptz;

comment on column public.sms_outbound.send_started_at is
  'Set right before the uBill call; such a row is never claimed again (no duplicate SMS).';
comment on column public.sms_outbound.provider_checked_at is
  'Last uBill report lookup by the sms-dispatch poll (delivery reports are polled, not pushed).';

-- Helpers take the moment as an argument so the boundaries can be tested.
create or replace function public.sms_check_in_window_open(p_now timestamptz)
returns boolean
language sql stable
set search_path = ''
as $$
  select (p_now at time zone 'Asia/Tbilisi')::time >= time '09:00'
     and (p_now at time zone 'Asia/Tbilisi')::time < time '21:00'
$$;

-- The Tbilisi day a check-in text queued at p_ts can first go out (after 21:00 = the next morning).
create or replace function public.sms_check_in_first_send_date(p_ts timestamptz)
returns date
language sql stable
set search_path = ''
as $$
  select (p_ts at time zone 'Asia/Tbilisi')::date
       + case when (p_ts at time zone 'Asia/Tbilisi')::time >= time '21:00' then 1 else 0 end
$$;

-- Check-in starts at the listing's check-in time (default 14:00), as [Check_In_Time] says.
create or replace function public.sms_check_in_started(p_check_in date, p_check_in_time time, p_now timestamptz)
returns boolean
language sql stable
set search_path = ''
as $$
  select p_now >= ((p_check_in + coalesce(p_check_in_time, time '14:00')) at time zone 'Asia/Tbilisi')
$$;

create or replace function public.sms_marketing_gate_open(p_gate text)
returns boolean
language sql stable
set search_path = ''
as $$
  select coalesce(
    (select (s.value ->> p_gate) = 'true' from public.site_settings s where s.key = 'sms_marketing_gates'),
    false)
$$;

create or replace function public.sms_mark_send_started(p_sms_id uuid, p_claim_token uuid)
returns boolean
language plpgsql security definer
set search_path = ''
as $$
begin
  update public.sms_outbound
  set send_started_at = now()
  where id = p_sms_id and status = 'approved'
    and dispatch_claim_token = p_claim_token and send_started_at is null;
  return found;
end;
$$;

create or replace function public.sms_fail_in_doubt_sends()
returns integer
language plpgsql security definer
set search_path = ''
as $$
declare v_n integer;
begin
  update public.sms_outbound s
  set status = 'failed', dispatch_claim_token = null, dispatch_claimed_at = null,
      provider_response = coalesce(s.provider_response, '{}'::jsonb)
        || jsonb_build_object('error', 'in_doubt', 'outcome', 'unknown')
  where s.status = 'approved' and s.charged_at is null
    and s.send_started_at is not null
    and s.send_started_at < now() - interval '15 minutes';
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

CREATE OR REPLACE FUNCTION public.sms_claim_dispatch_batch(p_claim_token uuid, p_limit integer DEFAULT 25)
 RETURNS TABLE(id uuid, recipient_phone text, message text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if p_claim_token is null then raise exception 'claim token is required' using errcode='22023'; end if;
  if not pg_try_advisory_xact_lock(hashtextextended('sms_dispatch_claim',19002)) then return; end if;
  perform public.sms_fail_in_doubt_sends();
  perform public.sms_cancel_ineligible_automation();
  perform public.sms_cancel_ineligible_price_drop();
  perform public.sms_cancel_resolved_cleaner_calls();
  return query
  with active_claims as (
    select s.sender_id,count(*)::integer count from public.sms_outbound s
    where s.status in ('approved','submitted') and s.charged_at is null
      and s.automation_kind in ('check_in','review_request','win_back','price_drop','consent_request','cleaner_call')
      and (s.status='submitted' or s.dispatch_claimed_at>=now()-interval '15 minutes') group by s.sender_id
  ), candidates as (
    select s.id,s.sender_id,s.created_at,
      (s.automation_kind in ('check_in','review_request','win_back','price_drop','consent_request','cleaner_call')) is true chargeable
    from public.sms_outbound s where s.status='approved' and s.charged_at is null
      and s.available_at<=now() and (s.expires_at is null or s.expires_at>now())
      and s.send_started_at is null
      and (s.automation_kind is distinct from 'check_in' or public.sms_check_in_window_open(now()))
      and (s.dispatch_claimed_at is null or s.dispatch_claimed_at<now()-interval '15 minutes')
  ), ranked as (
    select c.*,row_number() over(partition by c.sender_id,c.chargeable order by c.created_at,c.id) rn from candidates c
  ), chosen as (
    select r.id from ranked r left join public.balances b on b.user_id=r.sender_id
    left join active_claims a on a.sender_id=r.sender_id
    where r.chargeable is not true or r.rn<=greatest(coalesce(b.sms_remaining,0)-coalesce(a.count,0),0)
    order by r.created_at,r.id limit greatest(coalesce(p_limit,25),0)
  ), claimed as (
    update public.sms_outbound s set dispatch_claim_token=p_claim_token,dispatch_claimed_at=now(),dispatch_attempt_count=s.dispatch_attempt_count+1
    from chosen c where s.id=c.id returning s.id,s.recipient_phone,s.message
  ) select c.id,c.recipient_phone,c.message from claimed c;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.sms_release_dispatch_claim(p_sms_id uuid, p_claim_token uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  update public.sms_outbound
  set dispatch_claim_token = null, dispatch_claimed_at = null, send_started_at = null,
      -- uBill refused before sending: retry later, 1, 2, 4 ... 60 minutes apart
      available_at = greatest(available_at, now() + make_interval(
        mins => least(power(2, greatest(dispatch_attempt_count - 1, 0))::integer, 60)))
  where id = p_sms_id and status = 'approved'
    and dispatch_claim_token = p_claim_token;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.sms_cancel_ineligible_automation()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_n integer; v_m integer;
begin
  -- A row whose send started is in flight or in doubt: sms_fail_in_doubt_sends owns it.
  with ineligible as (
    select s.id,
      case
        when exists(select 1 from public.manual_bookings mb where mb.id=s.source_manual_booking_id and mb.status='cancelled')
          or exists(select 1 from public.bookings b where b.id=s.source_booking_id and b.status='cancelled')
          then 'booking_cancelled'
        when s.automation_kind='check_in' and exists(
          select 1 from public.manual_bookings mb left join public.properties p on p.id=mb.property_id
          where mb.id=s.source_manual_booking_id
            and (public.sms_check_in_started(mb.check_in,p.check_in_time,now())
              or public.sms_check_in_first_send_date(s.created_at)>mb.check_in))
          then 'check_in_started'
        when s.automation_kind='win_back' and not public.sms_marketing_gate_open('win_back')
          then 'marketing_paused'
        else 'eligibility_changed'
      end reason
    from public.sms_outbound s
    where s.status='approved' and s.charged_at is null and s.send_started_at is null
      and (s.dispatch_claimed_at is null or s.dispatch_claimed_at<now()-interval '15 minutes')
      and s.automation_kind in ('check_in','review_request','win_back')
      and not (
        exists(select 1 from public.sms_automation_rules r where r.user_id=s.sender_id and
          case s.automation_kind when 'check_in' then r.check_in_reminder_enabled when 'review_request' then r.review_request_enabled when 'win_back' then r.win_back_enabled and public.sms_marketing_gate_open('win_back') else false end)
        and (
          exists(
            select 1 from public.bookings b join public.properties p on p.id=b.property_id
            join public.profiles g on g.id=b.guest_id
            where b.id=s.source_booking_id and b.owner_id=s.sender_id and coalesce(p.is_for_sale,false)=false
              and public.sms_canonical_ge_phone(g.phone)=public.sms_canonical_ge_phone(s.recipient_phone)
              and (
                (s.automation_kind='check_in' and b.status='confirmed' and b.check_in=(now() at time zone 'Asia/Tbilisi')::date+1)
                or (s.automation_kind='review_request' and b.status='completed' and b.marketing_consent
                  and b.check_out=(now() at time zone 'Asia/Tbilisi')::date-1
                  and not exists(select 1 from public.reviews rv where rv.booking_id=b.id)
                  and not g.marketing_opt_out)
                or (s.automation_kind='win_back' and b.status='completed' and b.marketing_consent
                  and b.check_out=(now() at time zone 'Asia/Tbilisi')::date-90 and not g.marketing_opt_out
                  and not exists(select 1 from public.bookings later where later.owner_id=b.owner_id and later.guest_id=b.guest_id and later.status<>'cancelled' and later.check_in>b.check_out))
              )
          )
          or exists(
            select 1 from public.manual_bookings mb join public.properties p on p.id=mb.property_id
            where mb.id=s.source_manual_booking_id and mb.owner_id=s.sender_id and mb.status<>'cancelled'
              and coalesce(p.is_for_sale,false)=false
              and public.sms_canonical_ge_phone(mb.guest_phone)=public.sms_canonical_ge_phone(s.recipient_phone)
              and (
                -- check_in: a "ხვალ" text goes out the day before; a "დღეს" text goes out on the
                -- check-in day when that is the first day it could be sent (queued that day, or after
                -- 21:00 the evening before: quiet hours). Never once check-in has started.
                (s.automation_kind='check_in' and not public.sms_check_in_started(mb.check_in,p.check_in_time,now())
                  and (mb.check_in=(now() at time zone 'Asia/Tbilisi')::date+1
                  or (mb.check_in=(now() at time zone 'Asia/Tbilisi')::date
                    and public.sms_check_in_first_send_date(s.created_at)=mb.check_in)))
                or (s.automation_kind='review_request' and mb.marketing_consent
                  and mb.check_out=(now() at time zone 'Asia/Tbilisi')::date-1
                  and not exists(select 1 from public.reviews rv where rv.manual_booking_id=mb.id)
                  and not exists(select 1 from public.profiles po where po.marketing_opt_out and public.sms_canonical_ge_phone(po.phone)=public.sms_canonical_ge_phone(mb.guest_phone)))
                or (s.automation_kind='win_back' and mb.marketing_consent
                  and mb.check_out=(now() at time zone 'Asia/Tbilisi')::date-90
                  and not exists(select 1 from public.profiles po where po.marketing_opt_out and public.sms_canonical_ge_phone(po.phone)=public.sms_canonical_ge_phone(mb.guest_phone))
                  and not exists(select 1 from public.manual_bookings later where later.owner_id=mb.owner_id and later.status<>'cancelled' and public.sms_canonical_ge_phone(later.guest_phone)=public.sms_canonical_ge_phone(mb.guest_phone) and later.check_in>mb.check_out))
              )
          )
        )
      )
  )
  update public.sms_outbound s set status='failed',dispatch_claim_token=null,dispatch_claimed_at=null,
    provider_response=coalesce(s.provider_response,'{}'::jsonb)||jsonb_build_object('cancelled',i.reason)
  from ineligible i where s.id=i.id;
  get diagnostics v_n=row_count;

  -- Consent requests wait for the lawyer's approval (site_settings sms_marketing_gates).
  update public.sms_outbound s set status='failed',dispatch_claim_token=null,dispatch_claimed_at=null,
    provider_response=coalesce(s.provider_response,'{}'::jsonb)||jsonb_build_object('cancelled','marketing_paused')
  where s.status='approved' and s.charged_at is null and s.send_started_at is null
    and (s.dispatch_claimed_at is null or s.dispatch_claimed_at<now()-interval '15 minutes')
    and s.automation_kind='consent_request'
    and not public.sms_marketing_gate_open('consent_requests');
  get diagnostics v_m=row_count;
  return v_n+v_m;
end;
$function$;

create table if not exists public.sms_outbound_events (
  id bigint generated always as identity primary key,
  outbound_id uuid not null references public.sms_outbound(id) on delete cascade,
  from_status text,
  to_status text not null,
  report_status smallint check (report_status between 0 and 4),
  reason text,
  source text not null check (source in ('state', 'poll')),
  occurred_at timestamptz not null default now()
);
create index if not exists sms_outbound_events_outbound_idx
  on public.sms_outbound_events (outbound_id, occurred_at);
alter table public.sms_outbound_events enable row level security;
revoke all on table public.sms_outbound_events from public, anon, authenticated;
grant select on table public.sms_outbound_events to service_role;
comment on table public.sms_outbound_events is
  'Append-only SMS status history (no phone or text). Written by sms_outbound_record_event and sms_record_provider_report only.';

create or replace function public.sms_outbound_record_event()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  insert into public.sms_outbound_events (outbound_id, from_status, to_status, report_status, reason, source)
  values (
    new.id,
    case when tg_op = 'UPDATE' then old.status::text end,
    new.status::text,
    case when coalesce(new.provider_response ->> 'report_status', '') ~ '^[0-4]$'
      then (new.provider_response ->> 'report_status')::smallint end,
    left(coalesce(new.provider_response ->> 'cancelled', new.provider_response ->> 'expired',
      new.provider_response ->> 'error'), 40),
    'state');
  return null;
exception when others then
  -- History must never block a status change.
  raise warning 'sms_outbound_record_event failed for %: %', new.id, sqlerrm;
  return null;
end;
$$;
revoke all on function public.sms_outbound_record_event() from public, anon, authenticated;

drop trigger if exists sms_outbound_record_insert on public.sms_outbound;
create trigger sms_outbound_record_insert
  after insert on public.sms_outbound
  for each row execute function public.sms_outbound_record_event();
drop trigger if exists sms_outbound_record_status on public.sms_outbound;
create trigger sms_outbound_record_status
  after update of status on public.sms_outbound
  for each row when (old.status is distinct from new.status)
  execute function public.sms_outbound_record_event();

-- One poll lookup: stamp the row and keep the uBill status (null = the lookup failed).
create or replace function public.sms_record_provider_report(p_provider_message_id text, p_report_status integer)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare v_id uuid; v_status text;
begin
  update public.sms_outbound
  set provider_checked_at = now()
  where provider_message_id = p_provider_message_id
  returning id, status::text into v_id, v_status;
  if v_id is null then return; end if;
  insert into public.sms_outbound_events (outbound_id, from_status, to_status, report_status, reason, source)
  values (v_id, v_status, v_status,
    case when p_report_status between 0 and 4 then p_report_status end,
    case when p_report_status is null then 'lookup_failed' end,
    'poll');
end;
$$;

create or replace view public.sms_outbound_delivery_v
with (security_invoker = true) as
select s.id, s.automation_kind, s.status::text as status, s.charged_at is not null as charged,
  s.created_at, s.submitted_at, s.delivered_at, s.provider_message_id,
  lr.report_status as last_report_status, lr.occurred_at as last_report_at,
  case
    when s.status in ('pending', 'approved') then 'queued'
    when s.status = 'submitted' and lr.report_status = 0 then 'sent'
    when s.status = 'submitted' then 'accepted'
    when s.status = 'sent' and s.delivered_at is not null then 'delivered'
    when s.status = 'sent' then 'unknown'
    when s.status = 'failed' and s.provider_response ->> 'report_status' in ('2', '4') then 'undelivered'
    when s.status = 'failed' and (s.provider_response ->> 'outcome' = 'unknown'
      or s.provider_response ->> 'expired' = 'no_final_report') then 'unknown'
    when s.status = 'failed' then 'failed'
    else s.status::text
  end as delivery_state
from public.sms_outbound s
left join lateral (
  select e.report_status, e.occurred_at from public.sms_outbound_events e
  where e.outbound_id = s.id and e.report_status is not null
  order by e.occurred_at desc, e.id desc limit 1
) lr on true;
revoke all on table public.sms_outbound_delivery_v from public, anon, authenticated;
grant select on table public.sms_outbound_delivery_v to service_role;

revoke all on function public.sms_check_in_window_open(timestamptz) from public, anon, authenticated;
revoke all on function public.sms_check_in_first_send_date(timestamptz) from public, anon, authenticated;
revoke all on function public.sms_check_in_started(date, time, timestamptz) from public, anon, authenticated;
revoke all on function public.sms_marketing_gate_open(text) from public, anon, authenticated;
revoke all on function public.sms_mark_send_started(uuid, uuid) from public, anon, authenticated;
revoke all on function public.sms_fail_in_doubt_sends() from public, anon, authenticated;
revoke all on function public.sms_record_provider_report(text, integer) from public, anon, authenticated;
grant execute on function public.sms_check_in_window_open(timestamptz) to service_role;
grant execute on function public.sms_check_in_first_send_date(timestamptz) to service_role;
grant execute on function public.sms_check_in_started(date, time, timestamptz) to service_role;
grant execute on function public.sms_marketing_gate_open(text) to service_role;
grant execute on function public.sms_mark_send_started(uuid, uuid) to service_role;
grant execute on function public.sms_fail_in_doubt_sends() to service_role;
grant execute on function public.sms_record_provider_report(text, integer) to service_role;
