-- S07 (security hardening S3, 2026-09-27): the platform texts the manual-booking
-- SMS-consent link to the guest; the owner can only ask for that SMS and never
-- receives the link.
--
-- Apply after 20260927090000_s2_smart_match_sms_privacy_booking_lock: the four
-- functions replaced below are its live definitions (md5-guarded) with only the S07
-- lines changed.
-- - New SMS kind 'consent_request', billed like the rental automation (one credit,
--   charged on delivery): added to the kind CHECK and to the chargeable lists of
--   sms_claim_dispatch_batch, sms_mark_provider_delivered (S08's price_drop wording
--   unchanged; a consent request keeps the number, like check_in) and
--   sms_expire_stale_automation (2-day window).
-- - update_manual_booking (D7 body otherwise unchanged): saving a booking no longer
--   fails its queued consent request unless the guest's number changes; on a number
--   change the existing phone-invalidation trigger also revokes that link.
-- - request_manual_booking_sms_consent (service role only) queues the request, with
--   per-number and per-owner limits, and does not ask again a number whose guest
--   declined, or withdrew consent, for the booking.
-- - Retires consent links issued before this release.

-- Precondition: the four replaced functions must still have the exact bodies reviewed on
-- staging after 20260927090000 (md5 of prosrc); otherwise stop instead of overwriting an
-- older, newer or hotfixed body.
DO $guard$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT v.fn, v.expected,
           (SELECT md5(p.prosrc) FROM pg_proc p WHERE p.oid = to_regprocedure(v.fn)) AS live
    FROM (VALUES
      ('public.sms_claim_dispatch_batch(uuid,integer)', '5c3dd5b4f004d4044b921853f519b345'),
      ('public.sms_mark_provider_delivered(text,jsonb)', '4bb521469b5c7a86116dd7b891530376'),
      ('public.sms_expire_stale_automation()', '4fae2f559ed75c91f0d8da29b84e4f65'),
      ('public.update_manual_booking(uuid,date,date,text,text,text,integer,numeric,text,text,text,uuid,boolean,numeric,date)', 'cd575f572aec9af65cfc791f92a194a2')
    ) AS v(fn, expected)
  LOOP
    IF r.live IS DISTINCT FROM r.expected THEN
      RAISE EXCEPTION 'S3-S07: % differs from the reviewed body (md5 %); apply 20260927090000 first or regenerate this migration from the live definition', r.fn, r.live;
    END IF;
  END LOOP;
END
$guard$;

alter table public.sms_outbound
  drop constraint sms_outbound_automation_kind_check,
  add constraint sms_outbound_automation_kind_check check (
    automation_kind is null or automation_kind = any (array[
      'check_in', 'review_request', 'win_back', 'price_drop',
      'vip_activation', 'vip_expiry', 'subscription', 'consent_request'
    ]::text[])
  );

create index if not exists sms_outbound_consent_request_phone_idx
  on public.sms_outbound (recipient_phone, created_at desc)
  where automation_kind = 'consent_request';

-- The chargeable-kind lists below (claim ranking, delivery charge, expiry) and
-- the credit check in request_manual_booking_sms_consent must stay identical.
CREATE OR REPLACE FUNCTION public.sms_claim_dispatch_batch(p_claim_token uuid, p_limit integer DEFAULT 25)
 RETURNS TABLE(id uuid, recipient_phone text, message text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if p_claim_token is null then raise exception 'claim token is required' using errcode='22023'; end if;
  if not pg_try_advisory_xact_lock(hashtextextended('sms_dispatch_claim',19002)) then return; end if;
  perform public.sms_cancel_ineligible_automation();
  perform public.sms_cancel_ineligible_price_drop();
  return query
  with active_claims as (
    select s.sender_id,count(*)::integer count from public.sms_outbound s
    where s.status in ('approved','submitted') and s.charged_at is null
      and s.automation_kind in ('check_in','review_request','win_back','price_drop','consent_request')
      and (s.status='submitted' or s.dispatch_claimed_at>=now()-interval '15 minutes') group by s.sender_id
  ), candidates as (
    select s.id,s.sender_id,s.created_at,
      (s.automation_kind in ('check_in','review_request','win_back','price_drop','consent_request')) is true chargeable
    from public.sms_outbound s where s.status='approved' and s.charged_at is null
      and s.available_at<=now() and (s.expires_at is null or s.expires_at>now())
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
$function$;

CREATE OR REPLACE FUNCTION public.sms_mark_provider_delivered(p_provider_message_id text, p_provider_response jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_row public.sms_outbound%rowtype; v_remaining integer; v_charged boolean:=false;
begin
  select * into v_row from public.sms_outbound where provider_message_id=p_provider_message_id for update;
  if not found then raise exception 'provider message not found' using errcode='P0002'; end if;
  if v_row.status='sent' then return jsonb_build_object('delivered',true,'charged',false,'duplicate',true); end if;
  if v_row.status<>'submitted' then raise exception 'message is not submitted' using errcode='22023'; end if;
  if v_row.automation_kind in ('check_in','review_request','win_back','price_drop','consent_request') and v_row.charged_at is null then
    select sms_remaining into v_remaining from public.balances where user_id=v_row.sender_id for update;
    if found and coalesce(v_remaining,0)>=1 then
      update public.balances set sms_remaining=v_remaining-1,updated_at=now() where user_id=v_row.sender_id;
      insert into public.transactions(user_id,amount,type,description,reference_id)
      values(v_row.sender_id,0,'sms_send'::public.transaction_type,case when v_row.automation_kind='price_drop' then format('SMS მიწოდებულია (%s)',v_row.automation_kind) else format('SMS მიწოდებულია (%s): %s',v_row.automation_kind,v_row.recipient_phone) end,v_row.id);
      v_charged:=true;
    end if;
  end if;
  update public.sms_outbound set status='sent',sent_at=now(),delivered_at=now(),
    charged_at=case when v_charged then now() else charged_at end,
    provider_response=coalesce(provider_response,'{}'::jsonb)||coalesce(p_provider_response,'{}'::jsonb)
  where id=v_row.id;
  return jsonb_build_object('delivered',true,'charged',v_charged,'duplicate',false);
end;
$function$;

CREATE OR REPLACE FUNCTION public.sms_expire_stale_automation()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_n integer;
begin
  perform pg_advisory_xact_lock(hashtextextended('sms_dispatch_claim',19002));
  update public.sms_outbound s set status='failed',dispatch_claim_token=null,dispatch_claimed_at=null,
    provider_response=coalesce(s.provider_response,'{}'::jsonb)||jsonb_build_object('expired','window_passed','kind',s.automation_kind)
  where s.status='approved' and s.charged_at is null
    and (s.dispatch_claimed_at is null or s.dispatch_claimed_at<now()-interval '15 minutes')
    and s.automation_kind in ('check_in','review_request','win_back','price_drop','vip_activation','vip_expiry','subscription','consent_request')
    and (s.expires_at<=now() or (s.expires_at is null and s.created_at<now()-(case s.automation_kind when 'check_in' then interval '36 hours' when 'review_request' then interval '7 days' when 'win_back' then interval '30 days' else interval '2 days' end)));
  get diagnostics v_n=row_count; return v_n;
end;
$function$;

-- An edit that keeps the guest's canonical number leaves a queued consent request alone
-- (it carries a link for that number); a number change still fails it.
CREATE OR REPLACE FUNCTION public.update_manual_booking(p_id uuid, p_check_in date, p_check_out date, p_source text DEFAULT NULL::text, p_guest_name text DEFAULT NULL::text, p_guest_phone text DEFAULT NULL::text, p_guests_count integer DEFAULT NULL::integer, p_amount numeric DEFAULT NULL::numeric, p_note text DEFAULT NULL::text, p_status text DEFAULT 'manual'::text, p_client_list text DEFAULT NULL::text, p_renter_guest_id uuid DEFAULT NULL::uuid, p_marketing_consent boolean DEFAULT NULL::boolean, p_deposit_amount numeric DEFAULT '-1'::integer, p_deposit_paid_on date DEFAULT NULL::date)
 RETURNS manual_bookings
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_owner uuid := auth.uid();
  v_existing public.manual_bookings%rowtype;
  v_row public.manual_bookings%rowtype;
  v_guest_id uuid;
  v_conflict integer;
  v_deposit numeric;
  v_deposit_paid_on date;
begin
  if v_owner is null then raise exception 'ავტორიზაცია საჭიროა' using errcode = '42501'; end if;
  if p_check_out < p_check_in then raise exception 'არასწორი თარიღები' using errcode = '22023'; end if;
  if not exists (select 1 from public.manual_bookings where id = p_id and owner_id = v_owner) then raise exception 'ჯავშანი ვერ მოიძებნა' using errcode = 'P0002'; end if;
  perform pg_advisory_xact_lock(hashtextextended('sms_dispatch_claim', 19002));
  select * into v_existing from public.manual_bookings
  where id = p_id and owner_id = v_owner for update;
  if not found then raise exception 'ჯავშანი ვერ მოიძებნა' using errcode = 'P0002'; end if;

  if p_deposit_amount = -1 then
    v_deposit := v_existing.deposit_amount;
    v_deposit_paid_on := v_existing.deposit_paid_on;
  else
    v_deposit := p_deposit_amount;
    v_deposit_paid_on := p_deposit_paid_on;
  end if;
  if (v_deposit is not null and (p_amount is null or v_deposit < 0 or v_deposit > p_amount))
    or (v_deposit > 0 and v_deposit_paid_on is null)
    or (coalesce(v_deposit, 0) = 0 and v_deposit_paid_on is not null)
  then
    raise exception 'არასწორი ბეს მონაცემები' using errcode = '22023';
  end if;

  if p_renter_guest_id is not null then
    select id into v_guest_id from public.renter_guests
    where id = p_renter_guest_id and owner_id = v_owner;
    if v_guest_id is null then raise exception 'სტუმარი ვერ მოიძებნა' using errcode = '42501'; end if;
  elsif v_existing.renter_guest_id is not null then
    v_guest_id := v_existing.renter_guest_id;
  else
    v_guest_id := public.ensure_renter_guest(v_owner, p_guest_name, p_guest_phone);
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_existing.property_id::text, 0));
  select count(*) into v_conflict from public.calendar_blocks
  where property_id = v_existing.property_id
    and date between p_check_in and p_check_out
    and status in ('booked', 'blocked')
    and booking_id is distinct from p_id;
  if v_conflict > 0 then raise exception 'არჩეული თარიღები დაკავებულია' using errcode = '22023'; end if;

  update public.sms_outbound s
  set status = 'failed', dispatch_claim_token = null, dispatch_claimed_at = null,
      provider_response = coalesce(s.provider_response, '{}'::jsonb)
        || jsonb_build_object('cancelled', 'manual_booking_changed')
  where s.source_manual_booking_id = p_id and s.status = 'approved'
    and s.charged_at is null
    and (s.dispatch_claimed_at is null or s.dispatch_claimed_at < now() - interval '15 minutes')
    and (s.automation_kind is distinct from 'consent_request' or public.sms_canonical_ge_phone(nullif(btrim(p_guest_phone), '')) is distinct from public.sms_canonical_ge_phone(v_existing.guest_phone));

  delete from public.calendar_blocks where booking_id = p_id;
  perform set_config('app.manual_booking_sms_consent_write', 'allowed', true);
  update public.manual_bookings set
    check_in = p_check_in, check_out = p_check_out, source = p_source,
    guest_name = nullif(btrim(p_guest_name), ''),
    guest_phone = nullif(btrim(p_guest_phone), ''),
    guests_count = p_guests_count, amount = p_amount,
    deposit_amount = v_deposit, deposit_paid_on = v_deposit_paid_on,
    note = p_note,
    status = case when p_status = 'booked' then 'booked' else 'manual' end,
    status_before_cancel = null, cancelled_at = null, cancelled_by = null,
    client_list = p_client_list, renter_guest_id = v_guest_id
    -- p_marketing_consent is intentionally ignored.
  where id = p_id and owner_id = v_owner returning * into v_row;

  insert into public.calendar_blocks (property_id, date, status, booking_id)
  select v_existing.property_id, d::date, 'booked', p_id
  from generate_series(p_check_in, p_check_out, interval '1 day') d
  on conflict (property_id, date) do update set status = 'booked', booking_id = p_id
    where public.calendar_blocks.status = 'available';
  return v_row;
end;
$function$;

create or replace function public.request_manual_booking_sms_consent(
  p_owner_id uuid,
  p_manual_booking_id uuid,
  p_token_hash text,
  p_consent_version text,
  p_message text
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_booking public.manual_bookings%rowtype;
  v_phone text;
  v_latest text;
  v_answer public.manual_booking_sms_consents%rowtype;
  v_sms public.sms_outbound%rowtype;
  v_consent public.manual_booking_sms_consents%rowtype;
  v_count integer;
  v_credits integer;
begin
  if p_owner_id is null or p_manual_booking_id is null
    or p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$'
    or nullif(btrim(p_consent_version), '') is null
  then
    raise exception 'invalid consent request' using errcode = '22023';
  end if;
  -- The text must carry the link for exactly this token. Never echo the text
  -- in an error: the token in it is the guest's secret.
  if p_message is null or char_length(p_message) > 320
    or encode(sha256(convert_to(
         substring(p_message from '/sms-consent/([A-Za-z0-9_-]{43})'), 'UTF8')), 'hex')
       is distinct from p_token_hash
  then
    raise exception 'consent message does not match its token' using errcode = '22023';
  end if;

  -- Refusals hold only per-booking, per-owner and per-number locks; the global
  -- dispatch lock is taken further down, on the send path only.
  perform pg_advisory_xact_lock(hashtextextended('manual_sms_consent:' || p_manual_booking_id::text, 19003));
  perform pg_advisory_xact_lock(hashtextextended(p_owner_id::text, 19001));

  select * into v_booking from public.manual_bookings
  where id = p_manual_booking_id and owner_id = p_owner_id;
  if not found then
    raise exception 'booking not found' using errcode = 'P0002';
  end if;
  if v_booking.status = 'cancelled' then
    return jsonb_build_object('ok', false, 'reason', 'cancelled_booking');
  end if;
  v_phone := public.sms_canonical_ge_phone(v_booking.guest_phone);
  if v_phone is null then
    return jsonb_build_object('ok', false, 'reason', 'valid_phone_required');
  end if;
  perform pg_advisory_xact_lock(hashtextextended('manual_sms_consent_phone:' || v_phone, 19003));

  select c.status into v_latest from public.manual_booking_sms_consents c
  where c.manual_booking_id = p_manual_booking_id
  order by c.created_at desc, c.id desc
  limit 1;
  if v_latest = 'accepted' then
    return jsonb_build_object('ok', false, 'reason', 'consent_already_accepted');
  end if;

  -- A guest who declined, or withdrew an acceptance, is not asked again for this
  -- booking and number (judged on the latest link issued to the booking's current
  -- number). Acceptances withdrawn by the manual-sms-v1 retirement below were not
  -- the guest's own withdrawal and may be verified again.
  select c.* into v_answer from public.manual_booking_sms_consents c
  where c.manual_booking_id = p_manual_booking_id
    and c.phone_snapshot = v_phone
  order by c.created_at desc, c.id desc
  limit 1;
  if v_answer.declined_at is not null
    or (v_answer.status = 'revoked' and v_answer.accepted_at is not null
      and v_answer.consent_version is distinct from 'manual-sms-v1')
  then
    return jsonb_build_object('ok', false, 'reason', 'consent_declined');
  end if;

  -- Idempotent repeat: this booking's request is already queued, in flight or
  -- delivered to the same number within 24 hours.
  select * into v_sms from public.sms_outbound s
  where s.sender_id = p_owner_id
    and s.source_manual_booking_id = p_manual_booking_id
    and s.automation_kind = 'consent_request'
    and s.recipient_phone = v_phone
    and s.status in ('approved', 'submitted', 'sent')
    and s.created_at > now() - interval '24 hours';
  if found then
    return jsonb_build_object('ok', true, 'duplicate', true,
      'consent_status', coalesce(v_latest, 'not_requested'),
      'sms_status', v_sms.status, 'requested_at', v_sms.created_at);
  end if;

  -- One consent SMS per number per 24 hours, whoever asks. The refusal is
  -- generic so it does not reveal another host's request.
  if exists (
    select 1 from public.sms_outbound s
    where s.automation_kind = 'consent_request'
      and s.recipient_phone = v_phone
      and s.status in ('approved', 'submitted', 'sent')
      and s.created_at > now() - interval '24 hours'
  ) then
    return jsonb_build_object('ok', false, 'reason', 'phone_rate_limited');
  end if;

  select count(*)::integer into v_count from public.sms_outbound s
  where s.sender_id = p_owner_id
    and s.automation_kind = 'consent_request'
    and s.created_at > now() - interval '24 hours';
  if v_count >= 20 then
    return jsonb_build_object('ok', false, 'reason', 'daily_limit');
  end if;

  -- Billed like the rental automation: unsettled chargeable rows reserve the
  -- owner's credits, and sms_mark_provider_delivered charges on delivery only.
  select b.sms_remaining into v_credits from public.balances b where b.user_id = p_owner_id;
  select count(*)::integer into v_count from public.sms_outbound s
  where s.sender_id = p_owner_id
    and s.status in ('approved', 'submitted')
    and s.charged_at is null
    and (s.automation_kind in ('check_in','review_request','win_back','price_drop','consent_request')) is true;
  if coalesce(v_credits, 0) - v_count < 1 then
    return jsonb_build_object('ok', false, 'reason', 'insufficient_sms_credit');
  end if;

  -- Same order as cancel/update/respond: dispatch lock before the booking row
  -- lock that issue_manual_booking_sms_consent takes.
  perform pg_advisory_xact_lock(hashtextextended('sms_dispatch_claim', 19002));

  -- An earlier queued request would deliver a link that is revoked below.
  update public.sms_outbound s
  set status = 'failed',
      dispatch_claim_token = null,
      dispatch_claimed_at = null,
      provider_response = coalesce(s.provider_response, '{}'::jsonb)
        || jsonb_build_object('cancelled', 'guest_sms_consent_reissued')
  where s.sender_id = p_owner_id
    and s.source_manual_booking_id = p_manual_booking_id
    and s.automation_kind = 'consent_request'
    and s.status = 'approved'
    and s.charged_at is null
    and (s.dispatch_claimed_at is null
      or s.dispatch_claimed_at < now() - interval '15 minutes');
  -- Free the one-row-per-booking automation key, as cancel_manual_booking does.
  update public.sms_outbound s
  set source_manual_booking_id = null,
      provider_response = coalesce(s.provider_response, '{}'::jsonb)
        || jsonb_build_object('manual_booking_id', p_manual_booking_id)
  where s.sender_id = p_owner_id
    and s.source_manual_booking_id = p_manual_booking_id
    and s.automation_kind = 'consent_request';

  select * into v_consent from public.issue_manual_booking_sms_consent(
    p_owner_id, p_manual_booking_id, p_token_hash, v_phone, p_consent_version);

  insert into public.sms_outbound (
    sender_id, recipient_id, recipient_phone, contact_event_id, broadcast_id,
    automation_kind, source_manual_booking_id, message, status
  ) values (
    p_owner_id, null, v_phone, null, null,
    'consent_request', p_manual_booking_id, p_message, 'approved'
  ) returning * into v_sms;

  return jsonb_build_object('ok', true, 'duplicate', false,
    'consent_status', v_consent.status,
    'sms_status', v_sms.status, 'requested_at', v_sms.created_at);
end;
$$;

revoke all on function public.request_manual_booking_sms_consent(uuid, uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.request_manual_booking_sms_consent(uuid, uuid, text, text, text) to service_role;

-- Consent links issued before this release are retired, and acceptances given through
-- them are withdrawn, so every opt-in on record comes from an SMS-delivered link (the
-- 20260804140000 rule for owner-attested consent).
update public.sms_outbound s
set status = 'failed',
    dispatch_claim_token = null,
    dispatch_claimed_at = null,
    provider_response = coalesce(s.provider_response, '{}'::jsonb)
      || jsonb_build_object('cancelled', 'owner_shared_consent_link_retired')
where s.source_manual_booking_id in (
    select c.manual_booking_id from public.manual_booking_sms_consents c
    where c.consent_version = 'manual-sms-v1' and c.status = 'accepted'
  )
  and s.automation_kind in ('review_request', 'win_back')
  and s.status = 'approved'
  and s.charged_at is null
  and (s.dispatch_claimed_at is null
    or s.dispatch_claimed_at < now() - interval '15 minutes');

update public.manual_bookings mb
set marketing_consent = false, marketing_consent_at = null
where mb.marketing_consent is true
  and mb.id in (
    select c.manual_booking_id from public.manual_booking_sms_consents c
    where c.consent_version = 'manual-sms-v1' and c.status = 'accepted'
  );

update public.manual_booking_sms_consents
set status = 'revoked', revoked_at = coalesce(revoked_at, now())
where consent_version = 'manual-sms-v1'
  and token_hash is not null
  and status <> 'revoked';

notify pgrst, 'reload schema';
