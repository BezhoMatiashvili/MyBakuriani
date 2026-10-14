-- Price-drop SMS: the listing title as plain, link-free text (2026-10-14, C18 / C33).
--
-- sms_materialize_due_price_drop_events puts the first 25 characters of the
-- owner's listing title into a MyBakuriani SMS to the listing's price-drop
-- subscribers. The title now passes through public._notice_text (20261013150800),
-- as every other user-typed text in a notification or SMS does (C24 call-out
-- 20261013151000, the check-in and win-back texts in sms-automation-run/domain.ts):
-- line breaks, control, zero-width and bidi characters become one space, inner dots
-- become U+2024 and '://' becomes ':/ /', so a typed title never reaches a phone as
-- a link. Real titles read the same; the cut to 25 characters comes after.
--
-- Body = the live staging definition with that one value wrapped; the guard refuses
-- (55000) where the live body differs. CREATE OR REPLACE keeps the function's ACL.

do $guard$
declare
  v_live text;
begin
  select md5(p.prosrc) into v_live
    from pg_proc p
   where p.oid = to_regprocedure('public.sms_materialize_due_price_drop_events(text,integer,uuid[])');
  if v_live is distinct from 'afbba0c0d256c3b7220e6f7fe890c7e8' then
    raise exception 'price_drop_title_text: sms_materialize_due_price_drop_events() differs from the reviewed body (md5 %); regenerate this migration from the live definition', v_live
      using errcode = '55000';
  end if;
  if to_regprocedure('public._notice_text(text)') is null then
    raise exception 'price_drop_title_text: public._notice_text(text) is missing; apply 20261013150800 first'
      using errcode = '55000';
  end if;
end
$guard$;

CREATE OR REPLACE FUNCTION public.sms_materialize_due_price_drop_events(p_site_url text, p_limit integer DEFAULT 20, p_allowed_payers uuid[] DEFAULT NULL::uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
declare
  v_event public.sale_price_drop_events%rowtype;
  v_property public.properties%rowtype;
  v_required integer;
  v_balance integer;
  v_reserved integer;
  v_queued integer := 0;
  v_waiting integer := 0;
  v_cancelled integer := 0;
begin
  if p_site_url !~ '^https?://' then raise exception 'absolute site url required' using errcode = '22023'; end if;
  for v_event in
    select * from public.sale_price_drop_events
    where status in ('open','awaiting_credit') and send_after <= now()
      and (p_allowed_payers is null or payer_id = any(p_allowed_payers))
    order by send_after for update skip locked limit greatest(coalesce(p_limit,20),0)
  loop
    select * into v_property from public.properties where id = v_event.property_id;
    if not found or v_property.status <> 'active' or v_property.is_for_sale is not true
       or v_property.organization_id is not null or v_property.owner_id <> v_event.payer_id
       or v_property.sale_price is null or v_property.sale_price >= v_event.baseline_price
       or not exists (select 1 from public.sale_price_alert_rules r where r.property_id = v_event.property_id and r.enabled) then
      update public.sale_price_drop_events set status='cancelled', outcome_reason='listing_or_price_ineligible', updated_at=now() where id=v_event.id;
      v_cancelled := v_cancelled + 1; continue;
    end if;

    select count(*) into v_required
    from public.sale_price_alert_subscriptions s
    join public.profiles p on p.id = s.subscriber_id and not p.marketing_opt_out
    join auth.users u on u.id = s.subscriber_id and u.phone_confirmed_at is not null
    where s.property_id = v_event.property_id and s.active
      and s.subscribed_at <= v_event.last_decrease_at
      and s.subscriber_id <> v_event.payer_id
      and public.sms_canonical_ge_phone(u.phone) is not null;

    if v_required = 0 then
      update public.sale_price_drop_events set status='cancelled', outcome_reason='no_eligible_subscribers', latest_price=v_property.sale_price, updated_at=now() where id=v_event.id;
      v_cancelled := v_cancelled + 1; continue;
    end if;

    select coalesce(sms_remaining,0) into v_balance from public.balances where user_id=v_event.payer_id for update;
    v_balance := coalesce(v_balance,0);
    select count(*) into v_reserved from public.sms_outbound o
      where o.sender_id=v_event.payer_id and o.charged_at is null
        and o.status in ('approved','submitted')
        and o.automation_kind in ('check_in','review_request','win_back','price_drop');
    if v_balance - v_reserved < v_required then
      if now() >= v_event.send_after + interval '24 hours' then
        update public.sale_price_drop_events set status='expired', outcome_reason='insufficient_credit', latest_price=v_property.sale_price, updated_at=now() where id=v_event.id;
      else
        update public.sale_price_drop_events set status='awaiting_credit', outcome_reason='insufficient_credit', latest_price=v_property.sale_price, updated_at=now() where id=v_event.id;
        v_waiting := v_waiting + 1;
      end if;
      continue;
    end if;

    insert into public.sms_outbound(
      sender_id,recipient_id,recipient_phone,automation_kind,price_drop_event_id,message,status,available_at,expires_at
    )
    select v_event.payer_id,s.subscriber_id,public.sms_canonical_ge_phone(u.phone),'price_drop',v_event.id,
      left(format('ფასი შემცირდა! %s: %s→%s%s. %s/sales/%s — MyBakuriani',
        left(public._notice_text(v_property.title),25),trim_scale(v_event.baseline_price),trim_scale(v_property.sale_price),coalesce(nullif(btrim(v_property.currency),''),'₾'),rtrim(p_site_url,'/'),v_property.id),320),
      'approved',now(),now()+interval '48 hours'
    from public.sale_price_alert_subscriptions s
    join public.profiles p on p.id=s.subscriber_id and not p.marketing_opt_out
    join auth.users u on u.id=s.subscriber_id and u.phone_confirmed_at is not null
    where s.property_id=v_event.property_id and s.active and s.subscribed_at<=v_event.last_decrease_at
      and s.subscriber_id<>v_event.payer_id and public.sms_canonical_ge_phone(u.phone) is not null
    on conflict (price_drop_event_id,recipient_id) where price_drop_event_id is not null do nothing;
    update public.sale_price_drop_events set status='queued', outcome_reason=null, latest_price=v_property.sale_price, materialized_at=now(), updated_at=now() where id=v_event.id;
    v_queued := v_queued + 1;
  end loop;
  return jsonb_build_object('queued_events',v_queued,'waiting_credit',v_waiting,'cancelled',v_cancelled);
end;
$function$;
