-- Owner SMS credits are taken when uBill accepts the message (2026-10-07, C18).
--
-- Until now a chargeable SMS (check_in, review_request, win_back, price_drop,
-- consent_request) cost its credit only when uBill's delivery report said
-- "received" (sms_mark_provider_delivered). uBill does not always send that
-- report: on staging, consent request 5133624 sat `submitted` for hours while the
-- owner's balance still showed every credit, and after 3 days the poll would have
-- marked it failed, so it was never charged at all.
--
-- - sms_mark_claim_submitted debits one credit as the row becomes `submitted`
--   (same kind list, lock order and transaction shape as the delivery charge;
--   the price_drop description keeps no phone number, C18 S2).
-- - sms_mark_provider_undelivered gives the credit back only for uBill's own
--   "not delivered" (2) or "error" (4); a failed send is still never charged.
--   The poll's 3-day expiry without a final report is not a failure uBill
--   reported: a charged row keeps its credit and becomes `sent` (delivered_at
--   stays NULL); an uncharged one is failed as before.
-- - sms_mark_provider_delivered is unchanged: its `charged_at is null` branch
--   still charges a row the submit step could not (no credit at that moment).
-- - Rows already `submitted` and uncharged are charged once here.
--
-- Prod order: after 20260926120000_sms_ubill_delivery (it creates
-- sms_mark_provider_undelivered); the guard below refuses otherwise.

do $guard$
declare
  r record;
begin
  for r in
    select v.fn, v.expected,
           (select md5(p.prosrc) from pg_proc p where p.oid = to_regprocedure(v.fn)) as live
    from (values
      ('public.sms_mark_claim_submitted(uuid,uuid,text,jsonb)', 'da7649b9ce64fc4505b0bfc79f2b1148'),
      ('public.sms_mark_provider_undelivered(text,jsonb)', '7a4fb0745703f7074aa502b20152f389')
    ) as v(fn, expected)
  loop
    if r.live is distinct from r.expected then
      raise exception 'sms_charge_at_submit: % differs from the reviewed body (md5 %); regenerate this migration from the live definition', r.fn, r.live
        using errcode = '55000';
    end if;
  end loop;

  -- What this change relies on in functions it does not replace: the delivery
  -- charge skips a row that is already charged, and the dispatch preflight
  -- reserves credits only for uncharged rows (a charged `submitted` row has
  -- already left the balance).
  if position('v_row.charged_at is null' in
       (select p.prosrc from pg_proc p where p.oid = to_regprocedure('public.sms_mark_provider_delivered(text,jsonb)'))) = 0
     or position('s.charged_at is null' in
       (select p.prosrc from pg_proc p where p.oid = to_regprocedure('public.sms_claim_dispatch_batch(uuid,integer)'))) = 0 then
    raise exception 'sms_charge_at_submit: sms_mark_provider_delivered / sms_claim_dispatch_batch no longer test charged_at is null'
      using errcode = '55000';
  end if;
end
$guard$;

create or replace function public.sms_mark_claim_submitted(
  p_sms_id uuid,
  p_claim_token uuid,
  p_provider_message_id text,
  p_provider_response jsonb default null::jsonb
)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare v_row public.sms_outbound%rowtype; v_remaining integer; v_charged boolean:=false;
begin
  if nullif(btrim(p_provider_message_id),'') is null then raise exception 'provider message id required' using errcode='22023'; end if;
  select * into v_row from public.sms_outbound
  where id=p_sms_id and status='approved' and dispatch_claim_token=p_claim_token for update;
  if not found then raise exception 'sms claim not found' using errcode='P0002'; end if;
  if v_row.automation_kind in ('check_in','review_request','win_back','price_drop','consent_request') and v_row.charged_at is null then
    select sms_remaining into v_remaining from public.balances where user_id=v_row.sender_id for update;
    if found and coalesce(v_remaining,0)>=1 then
      update public.balances set sms_remaining=v_remaining-1,updated_at=now() where user_id=v_row.sender_id;
      insert into public.transactions(user_id,amount,type,description,reference_id)
      values(v_row.sender_id,0,'sms_send'::public.transaction_type,case when v_row.automation_kind='price_drop' then format('SMS გაგზავნილია (%s)',v_row.automation_kind) else format('SMS გაგზავნილია (%s): %s',v_row.automation_kind,v_row.recipient_phone) end,v_row.id);
      v_charged:=true;
    end if;
  end if;
  update public.sms_outbound set status='submitted',provider_message_id=p_provider_message_id,
    submitted_at=now(),dispatch_claim_token=null,dispatch_claimed_at=null,
    charged_at=case when v_charged then now() else charged_at end,
    provider_response=coalesce(p_provider_response,'{}'::jsonb)
  where id=v_row.id;
end;
$function$;

create or replace function public.sms_mark_provider_undelivered(
  p_provider_message_id text,
  p_provider_response jsonb default null::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare v_row public.sms_outbound%rowtype; v_reported_failure boolean; v_refunded boolean := false;
begin
  select * into v_row from public.sms_outbound
  where provider_message_id = p_provider_message_id for update;
  if not found then raise exception 'provider message not found' using errcode = 'P0002'; end if;
  if v_row.status = 'failed' then return jsonb_build_object('undelivered', true, 'duplicate', true); end if;
  if v_row.status <> 'submitted' then
    return jsonb_build_object('undelivered', false, 'ignored', v_row.status);
  end if;

  -- uBill report statusID 2 = not delivered, 4 = error. Anything else here is the
  -- poll's 3-day expiry without a final report: uBill accepted the message and
  -- never said it failed, so a charged row keeps its credit.
  v_reported_failure := coalesce(p_provider_response->>'report_status', '') in ('2', '4');
  if not v_reported_failure and v_row.charged_at is not null then
    update public.sms_outbound
    set status = 'sent',
        sent_at = coalesce(sent_at, now()),
        provider_response = coalesce(provider_response, '{}'::jsonb) || coalesce(p_provider_response, '{}'::jsonb)
    where id = v_row.id;
    return jsonb_build_object('undelivered', false, 'kept_charge', true, 'duplicate', false);
  end if;

  if v_row.charged_at is not null then
    update public.balances set sms_remaining = sms_remaining + 1, updated_at = now()
    where user_id = v_row.sender_id;
    if found then
      insert into public.transactions(user_id, amount, type, description, reference_id)
      values (v_row.sender_id, 0, 'sms_send'::public.transaction_type,
        case when v_row.automation_kind = 'price_drop'
          then format('SMS ვერ მიეწოდა, კრედიტი დაბრუნდა (%s)', v_row.automation_kind)
          else format('SMS ვერ მიეწოდა, კრედიტი დაბრუნდა (%s): %s', v_row.automation_kind, v_row.recipient_phone)
        end, v_row.id);
      v_refunded := true;
    end if;
  end if;

  update public.sms_outbound
  set status = 'failed',
      charged_at = case when v_refunded then null else charged_at end,
      provider_response = coalesce(provider_response, '{}'::jsonb) || coalesce(p_provider_response, '{}'::jsonb)
        || case when v_refunded then jsonb_build_object('credit_refunded', true) else '{}'::jsonb end
  where id = v_row.id;
  return jsonb_build_object('undelivered', true, 'refunded', v_refunded, 'duplicate', false);
end;
$function$;

revoke all on function public.sms_mark_claim_submitted(uuid, uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.sms_mark_claim_submitted(uuid, uuid, text, jsonb) to service_role;
revoke all on function public.sms_mark_provider_undelivered(text, jsonb) from public, anon, authenticated;
grant execute on function public.sms_mark_provider_undelivered(text, jsonb) to service_role;

-- One-off: charge the rows already handed to uBill under the old rule. The row
-- lock re-checks the filter, so a row the delivery charge settles meanwhile is
-- skipped. Dispatch lock first, as every other writer of these rows takes it.
do $backfill$
declare
  r record;
  v_remaining integer;
begin
  perform pg_advisory_xact_lock(hashtextextended('sms_dispatch_claim', 19002));
  for r in
    select s.id, s.sender_id, s.automation_kind, s.recipient_phone
    from public.sms_outbound s
    where s.status = 'submitted' and s.charged_at is null
      and s.automation_kind in ('check_in','review_request','win_back','price_drop','consent_request')
    order by s.id
    for update
  loop
    select sms_remaining into v_remaining from public.balances where user_id = r.sender_id for update;
    if found and coalesce(v_remaining, 0) >= 1 then
      update public.balances set sms_remaining = v_remaining - 1, updated_at = now() where user_id = r.sender_id;
      insert into public.transactions(user_id, amount, type, description, reference_id)
      values (r.sender_id, 0, 'sms_send'::public.transaction_type,
        case when r.automation_kind = 'price_drop'
          then format('SMS გაგზავნილია (%s)', r.automation_kind)
          else format('SMS გაგზავნილია (%s): %s', r.automation_kind, r.recipient_phone)
        end, r.id);
      update public.sms_outbound set charged_at = now() where id = r.id;
    end if;
  end loop;
end
$backfill$;
