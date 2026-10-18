-- C18: per-phone-number cap for the 'notification' SMS mirror.
--
-- 20261001130000 capped by user_id only, but profiles.phone is self-entered and
-- unverified (phone OTP was removed, auth.users.phone_confirmed_at is never set,
-- so a verified-number rule would silence every user). Several accounts could
-- carry one victim's number and each earn 8 platform-paid SMS a day to it.
-- Now at most 8 'notification' SMS per NUMBER per rolling day (non-failed rows,
-- any account), under a second try-lock keyed on the number so concurrent
-- notices on different accounts cannot both pass. Generated from the LIVE
-- body: the only change is the inserted block before the INSERT.

create index if not exists sms_outbound_notification_phone_recent_idx
  on public.sms_outbound (recipient_phone, created_at)
  where automation_kind = 'notification';

do $migration$
declare
  v_def text := pg_get_functiondef('public.notifications_enqueue_sms()'::regprocedure);
  v_anchor text := E'    insert into public.sms_outbound\n      (sender_id, recipient_id, recipient_phone, automation_kind, message,';
  v_block text := E'    -- Per NUMBER, across accounts: profiles.phone is unverified, so one number\n'
    || E'    -- on many accounts must not multiply the platform-paid SMS to it.\n'
    || E'    if not pg_try_advisory_xact_lock(hashtextextended(''sms_notification_phone:'' || v_phone, 19003)) then\n'
    || E'      return null;\n'
    || E'    end if;\n'
    || E'    if (select count(*)\n'
    || E'          from public.sms_outbound s\n'
    || E'         where s.automation_kind = ''notification''\n'
    || E'           and s.recipient_phone = v_phone\n'
    || E'           and s.status <> ''failed''\n'
    || E'           and s.created_at > now() - interval ''1 day'') >= 8 then\n'
    || E'      return null;\n'
    || E'    end if;\n\n';
begin
  if position('sms_notification_phone:' in v_def) > 0 then
    return; -- already applied
  end if;
  if length(v_def) - length(replace(v_def, v_anchor, '')) <> length(v_anchor) then
    raise exception 'notifications_enqueue_sms: insert anchor not found exactly once';
  end if;
  execute replace(v_def, v_anchor, v_block || v_anchor);
end
$migration$;

revoke all on function public.notifications_enqueue_sms() from public, anon, authenticated;
grant execute on function public.notifications_enqueue_sms() to service_role;
