-- C18 / C19: free platform-paid SMS mirror of a few key notifications.
--
-- A user with several cabinets (roles) already gets every notification in the
-- bell and, for email_notification_types(), by email. This adds the SMS leg for
-- an explicit allow-list only: money, cleaning calls, Smart Match offers and
-- moderation / verification outcomes, plus job applications.
--
-- It is a FREE system kind ('notification', like vip_activation / vip_expiry /
-- subscription): the platform pays uBill, balances.sms_remaining is never
-- debited, no marketing consent is needed (service message, C30). It is NOT in
-- any charged-kind list: sms_claim_dispatch_batch (x2), sms_mark_provider_delivered,
-- sms_mark_claim_sent and the request_manual_booking_sms_consent credit check
-- are left untouched and treat every kind they do not name as free.
--
-- Deliberately NOT in the allow-list: smart_match_request (fans out to every
-- active rental owner), every admin_* queue type, broadcast, vip_* (own SMS),
-- membership_* and all other class-2 informational types.
--
-- The trigger is scope-blind (keyed on user_id, so a user is reached for EVERY
-- role they hold), never fails the notification insert, and writes only
-- 'MyBakuriani: ' + the notification TITLE (no body, no link, no PII).
-- sms_expire_stale_automation is redefined from its LIVE body (scripted
-- replace below, not retyped) so a queued row older than its 6 h expires_at is
-- retired instead of sent late.

-- 1. Which notification a row mirrors (needed for the per-type/per-cabinet cap
--    and to make the mirror idempotent: one SMS per notification).
alter table public.sms_outbound
  add column if not exists source_notification_id uuid
    references public.notifications(id) on delete set null;

create unique index if not exists sms_outbound_source_notification_uidx
  on public.sms_outbound (source_notification_id);

create index if not exists sms_outbound_notification_recent_idx
  on public.sms_outbound (recipient_id, created_at)
  where automation_kind = 'notification';

-- 2. New free kind.
alter table public.sms_outbound
  drop constraint if exists sms_outbound_automation_kind_check;
alter table public.sms_outbound
  add constraint sms_outbound_automation_kind_check
  check (automation_kind is null or automation_kind = any (array[
    'check_in', 'review_request', 'win_back', 'price_drop',
    'vip_activation', 'vip_expiry', 'subscription', 'consent_request',
    'notification'
  ]));

-- 3. Allow-list (single definition; scripts/check-contracts.mjs C18 pins it).
create or replace function public.sms_notification_types()
 returns text[]
 language sql
 immutable
 set search_path to ''
as $function$
  select array[
    -- money
    'payment_success', 'payment_failed', 'payment_refund',
    -- cleaning calls
    'cleaning_task_new', 'cleaning_task_status', 'cleaning_task_cancelled',
    'cleaning_task_cancellation_requested',
    -- Smart Match answer to the guest
    'smart_match_offer',
    -- moderation / verification outcome
    'listing_moderation', 'verification',
    -- hiring
    'job_application'
  ]::text[];
$function$;

-- 4. The mirror. AFTER INSERT, modelled on email_enqueue_notification.
create or replace function public.notifications_enqueue_sms()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_phone text;
  v_title text;
begin
  if not (new.type = any (public.sms_notification_types())) then
    return null;
  end if;

  begin
    -- No usable Georgian mobile number on the profile = no SMS (skipped quietly).
    select public.sms_canonical_ge_phone(p.phone) into v_phone
      from public.profiles p
     where p.id = new.user_id;
    if v_phone is null then
      return null;
    end if;

    -- Title only, one line, <= 130 chars in total (about two UCS-2 segments).
    v_title := btrim(regexp_replace(coalesce(new.title, ''), '\s+', ' ', 'g'));
    if v_title = '' then
      return null;
    end if;
    if char_length(v_title) > 117 then
      v_title := left(v_title, 116) || '…';
    end if;

    -- Serialise per recipient so two concurrent notices cannot both pass the caps.
    -- try-lock, never a blocking wait: a lock wait cancelled by statement_timeout
    -- (57014) escapes WHEN OTHERS and would fail the notification insert. Losing
    -- the race just skips this SMS; the notification itself is unaffected.
    if not pg_try_advisory_xact_lock(hashtextextended('sms_notification:' || new.user_id::text, 19003)) then
      return null;
    end if;

    -- At most 3 per recipient, type AND cabinet (dashboard_scope) per rolling
    -- day, so one role's events cannot starve another role's.
    if (select count(*)
          from public.sms_outbound s
          join public.notifications n on n.id = s.source_notification_id
         where s.automation_kind = 'notification'
           and s.recipient_id = new.user_id
           and s.status <> 'failed'
           and s.created_at > now() - interval '1 day'
           and n.type = new.type
           and n.dashboard_scope is not distinct from new.dashboard_scope) >= 3 then
      return null;
    end if;

    -- And at most 8 notification SMS per recipient per rolling day, whatever the type.
    if (select count(*)
          from public.sms_outbound s
         where s.automation_kind = 'notification'
           and s.recipient_id = new.user_id
           and s.status <> 'failed'
           and s.created_at > now() - interval '1 day') >= 8 then
      return null;
    end if;

    insert into public.sms_outbound
      (sender_id, recipient_id, recipient_phone, automation_kind, message,
       status, expires_at, source_notification_id)
    values
      (new.user_id, new.user_id, v_phone, 'notification', 'MyBakuriani: ' || v_title,
       'approved', now() + interval '6 hours', new.id)
    on conflict (source_notification_id) do nothing;
  exception when others then
    raise warning 'notifications_enqueue_sms skipped %: % %', new.id, sqlstate, sqlerrm;
  end;
  return null;
end;
$function$;

drop trigger if exists notifications_enqueue_sms on public.notifications;
create trigger notifications_enqueue_sms
  after insert on public.notifications
  for each row execute function public.notifications_enqueue_sms();

-- 5. Retire a stale 'notification' row like the other free system kinds.
--    Generated from the LIVE body: the one change is the kind list.
do $migration$
declare
  v_def text := pg_get_functiondef('public.sms_expire_stale_automation()'::regprocedure);
  v_old text := '''vip_expiry'',''subscription'',''consent_request'')';
  v_new text := '''vip_expiry'',''subscription'',''consent_request'',''notification'')';
begin
  if position('''notification''' in v_def) > 0 then
    return; -- already applied
  end if;
  if length(v_def) - length(replace(v_def, v_old, '')) <> length(v_old) then
    raise exception 'sms_expire_stale_automation: expected kind list not found exactly once';
  end if;
  execute replace(v_def, v_old, v_new);
end
$migration$;

-- 6. C34 grants: service_role / postgres only.
revoke all on function public.sms_notification_types() from public, anon, authenticated;
grant execute on function public.sms_notification_types() to service_role;
revoke all on function public.notifications_enqueue_sms() from public, anon, authenticated;
grant execute on function public.notifications_enqueue_sms() to service_role;
revoke all on function public.sms_expire_stale_automation() from public, anon, authenticated;
grant execute on function public.sms_expire_stale_automation() to service_role;
