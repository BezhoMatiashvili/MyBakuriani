-- uBill.ge delivery reports (C18).
--
-- 1. sms_mark_provider_undelivered: the failure twin of sms_mark_provider_delivered.
--    A submitted row whose provider reports "not delivered" / "error" becomes
--    'failed' and is never charged. Idempotent; a row already 'sent' is left alone.
-- 2. sms_expire_stale_automation also retires system rows (vip_activation,
--    vip_expiry, subscription) older than 48 hours. They previously had no
--    window at all, so a VIP notice queued weeks before a provider existed would
--    have gone out the first time delivery was enabled.

create or replace function public.sms_mark_provider_undelivered(
  p_provider_message_id text, p_provider_response jsonb default null
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_row public.sms_outbound%rowtype;
begin
  select * into v_row from public.sms_outbound
  where provider_message_id = p_provider_message_id for update;
  if not found then raise exception 'provider message not found' using errcode = 'P0002'; end if;
  if v_row.status = 'failed' then return jsonb_build_object('undelivered', true, 'duplicate', true); end if;
  if v_row.status <> 'submitted' then
    return jsonb_build_object('undelivered', false, 'ignored', v_row.status);
  end if;
  update public.sms_outbound
  set status = 'failed',
      provider_response = coalesce(provider_response, '{}'::jsonb) || coalesce(p_provider_response, '{}'::jsonb)
  where id = v_row.id;
  return jsonb_build_object('undelivered', true, 'duplicate', false);
end;
$$;

create or replace function public.sms_expire_stale_automation()
 returns integer
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare v_n integer;
begin
  perform pg_advisory_xact_lock(hashtextextended('sms_dispatch_claim',19002));
  update public.sms_outbound s set status='failed',dispatch_claim_token=null,dispatch_claimed_at=null,
    provider_response=coalesce(s.provider_response,'{}'::jsonb)||jsonb_build_object('expired','window_passed','kind',s.automation_kind)
  where s.status='approved' and s.charged_at is null
    and (s.dispatch_claimed_at is null or s.dispatch_claimed_at<now()-interval '15 minutes')
    and s.automation_kind in ('check_in','review_request','win_back','price_drop','vip_activation','vip_expiry','subscription')
    and (s.expires_at<=now() or (s.expires_at is null and s.created_at<now()-(case s.automation_kind when 'check_in' then interval '36 hours' when 'review_request' then interval '7 days' when 'win_back' then interval '30 days' else interval '2 days' end)));
  get diagnostics v_n=row_count; return v_n;
end;
$function$;

revoke all on function public.sms_mark_provider_undelivered(text, jsonb) from public, anon, authenticated;
grant execute on function public.sms_mark_provider_undelivered(text, jsonb) to service_role;

notify pgrst, 'reload schema';
