-- Controlled SMS: retire owner-authored messages, add seller price-drop alerts,
-- manual-review tokens, atomic rule patches, and provider-delivered billing.

alter table public.sms_outbound
  add column if not exists price_drop_event_id uuid,
  add column if not exists available_at timestamptz not null default now(),
  add column if not exists expires_at timestamptz,
  add column if not exists provider_message_id text,
  add column if not exists submitted_at timestamptz,
  add column if not exists delivered_at timestamptz,
  add column if not exists legacy_origin boolean not null default false;

update public.sms_outbound
set legacy_origin = true
where automation_kind is null and not legacy_origin;

update public.sms_outbound
set status = 'failed',
    provider_response = coalesce(provider_response, '{}'::jsonb)
      || jsonb_build_object('cancelled', 'free_text_sms_retired')
where automation_kind is null and status in ('pending', 'approved');

update public.sms_broadcasts
set status = 'failed', admin_notes = coalesce(admin_notes, 'free_text_sms_retired')
where status in ('pending', 'partial_approved', 'approved');

alter table public.sms_outbound drop constraint if exists sms_outbound_automation_kind_check;
alter table public.sms_outbound add constraint sms_outbound_automation_kind_check
  check (automation_kind is null or automation_kind in (
    'check_in', 'review_request', 'win_back', 'price_drop',
    'vip_activation', 'vip_expiry', 'subscription'
  ));
alter table public.sms_outbound drop constraint if exists sms_outbound_controlled_origin_check;
alter table public.sms_outbound add constraint sms_outbound_controlled_origin_check
  check (automation_kind is not null or legacy_origin);

drop policy if exists "sms_outbound_sender_select" on public.sms_outbound;

do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as signature
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('sms_send_broadcast', 'sms_audience_count', 'sms_consume_credit', 'sms_consume_credits_bulk')
  loop
    execute format('revoke all on function %s from public, anon, authenticated', r.signature);
  end loop;
end $$;

create or replace function public.sms_patch_automation_rules(
  p_sender_id uuid,
  p_patch jsonb
) returns public.sms_automation_rules
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_old public.sms_automation_rules%rowtype;
  v_new public.sms_automation_rules%rowtype;
  v_keys text[];
begin
  if p_sender_id is null or p_patch is null or jsonb_typeof(p_patch) <> 'object' then
    raise exception 'invalid patch' using errcode = '22023';
  end if;
  select array_agg(key) into v_keys from jsonb_object_keys(p_patch) key;
  if v_keys is null or v_keys <@ array[]::text[] then
    raise exception 'empty patch' using errcode = '22023';
  end if;
  if not v_keys <@ array[
    'check_in_reminder_enabled','review_request_enabled','win_back_enabled',
    'win_back_discount_value','win_back_discount_period'
  ]::text[] then
    raise exception 'unknown rule key' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.properties p
    where p.owner_id = p_sender_id and coalesce(p.is_for_sale, false) = false
  ) then
    raise exception 'rental listing required' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('sms_dispatch_claim', 19002));
  insert into public.sms_automation_rules(user_id) values (p_sender_id)
  on conflict (user_id) do nothing;
  select * into v_old from public.sms_automation_rules where user_id = p_sender_id for update;

  update public.sms_automation_rules r set
    check_in_reminder_enabled = case when p_patch ? 'check_in_reminder_enabled' then (p_patch->>'check_in_reminder_enabled')::boolean else r.check_in_reminder_enabled end,
    review_request_enabled = case when p_patch ? 'review_request_enabled' then (p_patch->>'review_request_enabled')::boolean else r.review_request_enabled end,
    win_back_enabled = case when p_patch ? 'win_back_enabled' then (p_patch->>'win_back_enabled')::boolean else r.win_back_enabled end,
    win_back_discount_value = case when p_patch ? 'win_back_discount_value' then nullif(btrim(p_patch->>'win_back_discount_value'), '') else r.win_back_discount_value end,
    win_back_discount_period = case when p_patch ? 'win_back_discount_period' then nullif(btrim(p_patch->>'win_back_discount_period'), '') else r.win_back_discount_period end,
    updated_at = now()
  where r.user_id = p_sender_id returning * into v_new;

  if char_length(coalesce(v_new.win_back_discount_value, '')) > 10
     or char_length(coalesce(v_new.win_back_discount_period, '')) > 30 then
    raise exception 'rule value too long' using errcode = '22001';
  end if;
  if v_old.check_in_reminder_enabled is distinct from v_new.check_in_reminder_enabled then
    perform public.sms_cancel_queued_automation(p_sender_id, 'check_in', 'configuration_changed');
  end if;
  if v_old.review_request_enabled is distinct from v_new.review_request_enabled then
    perform public.sms_cancel_queued_automation(p_sender_id, 'review_request', 'configuration_changed');
  end if;
  if v_old.win_back_enabled is distinct from v_new.win_back_enabled
     or v_old.win_back_discount_value is distinct from v_new.win_back_discount_value
     or v_old.win_back_discount_period is distinct from v_new.win_back_discount_period then
    perform public.sms_cancel_queued_automation(p_sender_id, 'win_back', 'configuration_changed');
  end if;
  return v_new;
end;
$$;

revoke all on function public.sms_patch_automation_rules(uuid,jsonb) from public, anon, authenticated;
grant execute on function public.sms_patch_automation_rules(uuid,jsonb) to service_role;

create table if not exists public.sale_price_alert_rules (
  property_id uuid primary key references public.properties(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.sale_price_alert_subscriptions (
  property_id uuid not null references public.properties(id) on delete cascade,
  subscriber_id uuid not null references public.profiles(id) on delete cascade,
  active boolean not null default true,
  consent_version text not null default 'price-drop-v1',
  subscribed_at timestamptz not null default now(),
  unsubscribed_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (property_id, subscriber_id)
);

create table if not exists public.sale_price_drop_events (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  payer_id uuid not null references public.profiles(id) on delete cascade,
  baseline_price numeric(12,2) not null,
  latest_price numeric(12,2) not null,
  lowest_price numeric(12,2) not null,
  property_title text not null,
  currency text,
  window_started_at timestamptz not null default now(),
  last_decrease_at timestamptz not null default now(),
  send_after timestamptz not null,
  status text not null default 'open' check (status in ('open','awaiting_credit','queued','cancelled','expired')),
  outcome_reason text,
  materialized_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists sale_price_drop_one_open
  on public.sale_price_drop_events(property_id)
  where status in ('open','awaiting_credit');
create index if not exists sale_price_drop_due
  on public.sale_price_drop_events(send_after)
  where status in ('open','awaiting_credit');

alter table public.sms_outbound
  drop constraint if exists sms_outbound_price_drop_event_id_fkey;
alter table public.sms_outbound
  add constraint sms_outbound_price_drop_event_id_fkey
  foreign key (price_drop_event_id) references public.sale_price_drop_events(id) on delete set null;
create unique index if not exists sms_outbound_price_drop_recipient
  on public.sms_outbound(price_drop_event_id, recipient_id)
  where price_drop_event_id is not null;
create unique index if not exists sms_outbound_provider_message
  on public.sms_outbound(provider_message_id)
  where provider_message_id is not null;

alter table public.sale_price_alert_rules enable row level security;
alter table public.sale_price_alert_subscriptions enable row level security;
alter table public.sale_price_drop_events enable row level security;
drop policy if exists "price alert subscriber reads own" on public.sale_price_alert_subscriptions;
create policy "price alert subscriber reads own" on public.sale_price_alert_subscriptions
  for select using (subscriber_id = auth.uid());
drop policy if exists "price alert admin all rules" on public.sale_price_alert_rules;
create policy "price alert admin all rules" on public.sale_price_alert_rules for all
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));
drop policy if exists "price alert admin all subscriptions" on public.sale_price_alert_subscriptions;
create policy "price alert admin all subscriptions" on public.sale_price_alert_subscriptions for all
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));
drop policy if exists "price alert admin all events" on public.sale_price_drop_events;
create policy "price alert admin all events" on public.sale_price_drop_events for all
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

create or replace function public.sms_set_price_drop_rule(
  p_owner_id uuid, p_property_id uuid, p_enabled boolean
) returns public.sale_price_alert_rules
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_rule public.sale_price_alert_rules%rowtype;
begin
  if not exists (
    select 1 from public.properties p where p.id = p_property_id
      and p.owner_id = p_owner_id and p.is_for_sale is true and p.organization_id is null
  ) then raise exception 'personal sale listing not found' using errcode = 'P0002'; end if;
  perform pg_advisory_xact_lock(hashtextextended('sms_dispatch_claim', 19002));
  insert into public.sale_price_alert_rules(property_id, owner_id, enabled, updated_at)
  values (p_property_id, p_owner_id, p_enabled, now())
  on conflict (property_id) do update set enabled = excluded.enabled, owner_id = excluded.owner_id, updated_at = now()
  returning * into v_rule;
  if not p_enabled then
    update public.sale_price_drop_events set status = 'cancelled', outcome_reason = 'seller_disabled', updated_at = now()
    where property_id = p_property_id and status in ('open','awaiting_credit');
    update public.sms_outbound set status = 'failed', provider_response = coalesce(provider_response, '{}'::jsonb) || '{"cancelled":"seller_disabled"}'::jsonb
    where price_drop_event_id in (select id from public.sale_price_drop_events where property_id = p_property_id)
      and status = 'approved' and dispatch_claim_token is null;
  end if;
  return v_rule;
end;
$$;

create or replace function public.sms_capture_sale_price_drop()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare v_event_id uuid;
begin
  if new.is_for_sale is not true or new.organization_id is not null or new.status <> 'active'
     or old.sale_price is null or new.sale_price is null or new.sale_price <= 0
     or new.sale_price >= old.sale_price
     or not exists (select 1 from public.sale_price_alert_rules r where r.property_id = new.id and r.owner_id = new.owner_id and r.enabled)
     or not (auth.role() = 'service_role' or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')) then
    return new;
  end if;
  perform pg_advisory_xact_lock(hashtextextended(new.id::text, 39117));
  select id into v_event_id from public.sale_price_drop_events
  where property_id = new.id and status in ('open','awaiting_credit') for update;
  if v_event_id is null then
    insert into public.sale_price_drop_events(
      property_id,payer_id,baseline_price,latest_price,lowest_price,property_title,currency,send_after
    ) values (
      new.id,new.owner_id,old.sale_price,new.sale_price,new.sale_price,new.title,new.currency,now() + interval '24 hours'
    );
  else
    update public.sale_price_drop_events set
      payer_id = new.owner_id, latest_price = new.sale_price,
      lowest_price = least(lowest_price, new.sale_price), property_title = new.title,
      currency = new.currency, last_decrease_at = now(), status = 'open',
      outcome_reason = null, updated_at = now()
    where id = v_event_id;
  end if;
  return new;
end;
$$;

drop trigger if exists sms_capture_sale_price_drop on public.properties;
create trigger sms_capture_sale_price_drop
after update of sale_price on public.properties
for each row execute function public.sms_capture_sale_price_drop();

create or replace function public.sms_materialize_due_price_drop_events(
  p_site_url text, p_limit integer default 20, p_allowed_payers uuid[] default null
) returns jsonb
language plpgsql security definer set search_path = public, auth, pg_temp as $$
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
      left(format('ფასი შემცირდა! %s: %s-დან %s-მდე. ნახეთ: %s/sales/%s — MyBakuriani.ge',
        left(v_property.title,100),v_event.baseline_price,v_property.sale_price,rtrim(p_site_url,'/'),v_property.id),320),
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
$$;

create or replace function public.sms_claim_dispatch_batch(
  p_claim_token uuid, p_limit integer default 25
) returns table (id uuid, recipient_phone text, message text)
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if p_claim_token is null then raise exception 'claim token is required' using errcode='22023'; end if;
  if not pg_try_advisory_xact_lock(hashtextextended('sms_dispatch_claim',19002)) then return; end if;
  perform public.sms_cancel_ineligible_automation();
  perform public.sms_cancel_ineligible_price_drop();
  return query
  with active_claims as (
    select s.sender_id,count(*)::integer count from public.sms_outbound s
    where s.status in ('approved','submitted') and s.charged_at is null
      and s.automation_kind in ('check_in','review_request','win_back','price_drop')
      and (s.status='submitted' or s.dispatch_claimed_at>=now()-interval '15 minutes') group by s.sender_id
  ), candidates as (
    select s.id,s.sender_id,s.created_at,
      (s.automation_kind in ('check_in','review_request','win_back','price_drop')) is true chargeable
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
$$;

create or replace function public.sms_mark_claim_submitted(
  p_sms_id uuid,p_claim_token uuid,p_provider_message_id text,p_provider_response jsonb default null
) returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if nullif(btrim(p_provider_message_id),'') is null then raise exception 'provider message id required' using errcode='22023'; end if;
  update public.sms_outbound set status='submitted',provider_message_id=p_provider_message_id,
    submitted_at=now(),dispatch_claim_token=null,dispatch_claimed_at=null,
    provider_response=coalesce(p_provider_response,'{}'::jsonb)
  where id=p_sms_id and status='approved' and dispatch_claim_token=p_claim_token;
  if not found then raise exception 'sms claim not found' using errcode='P0002'; end if;
end;
$$;

create or replace function public.sms_mark_provider_delivered(
  p_provider_message_id text,p_provider_response jsonb default null
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_row public.sms_outbound%rowtype; v_remaining integer; v_charged boolean:=false;
begin
  select * into v_row from public.sms_outbound where provider_message_id=p_provider_message_id for update;
  if not found then raise exception 'provider message not found' using errcode='P0002'; end if;
  if v_row.status='sent' then return jsonb_build_object('delivered',true,'charged',false,'duplicate',true); end if;
  if v_row.status<>'submitted' then raise exception 'message is not submitted' using errcode='22023'; end if;
  if v_row.automation_kind in ('check_in','review_request','win_back','price_drop') and v_row.charged_at is null then
    select sms_remaining into v_remaining from public.balances where user_id=v_row.sender_id for update;
    if found and coalesce(v_remaining,0)>=1 then
      update public.balances set sms_remaining=v_remaining-1,updated_at=now() where user_id=v_row.sender_id;
      insert into public.transactions(user_id,amount,type,description,reference_id)
      values(v_row.sender_id,0,'sms_send'::public.transaction_type,format('SMS მიწოდებულია (%s): %s',v_row.automation_kind,v_row.recipient_phone),v_row.id);
      v_charged:=true;
    end if;
  end if;
  update public.sms_outbound set status='sent',sent_at=now(),delivered_at=now(),
    charged_at=case when v_charged then now() else charged_at end,
    provider_response=coalesce(provider_response,'{}'::jsonb)||coalesce(p_provider_response,'{}'::jsonb)
  where id=v_row.id;
  return jsonb_build_object('delivered',true,'charged',v_charged,'duplicate',false);
end;
$$;

create or replace function public.sms_expire_stale_automation()
returns integer language plpgsql security definer set search_path=public,pg_temp as $$
declare v_n integer;
begin
  perform pg_advisory_xact_lock(hashtextextended('sms_dispatch_claim',19002));
  update public.sms_outbound s set status='failed',dispatch_claim_token=null,dispatch_claimed_at=null,
    provider_response=coalesce(s.provider_response,'{}'::jsonb)||jsonb_build_object('expired','window_passed','kind',s.automation_kind)
  where s.status='approved' and s.charged_at is null
    and (s.dispatch_claimed_at is null or s.dispatch_claimed_at<now()-interval '15 minutes')
    and s.automation_kind in ('check_in','review_request','win_back','price_drop')
    and (s.expires_at<=now() or (s.expires_at is null and s.created_at<now()-(case s.automation_kind when 'check_in' then interval '36 hours' when 'review_request' then interval '7 days' when 'win_back' then interval '30 days' else interval '2 days' end)));
  get diagnostics v_n=row_count; return v_n;
end;
$$;

create or replace function public.sms_cancel_ineligible_automation()
returns integer language plpgsql security definer set search_path=public,pg_temp as $$
declare v_n integer;
begin
  update public.sms_outbound s set status='failed',dispatch_claim_token=null,dispatch_claimed_at=null,
    provider_response=coalesce(s.provider_response,'{}'::jsonb)||jsonb_build_object('cancelled','eligibility_changed')
  where s.status='approved' and s.charged_at is null
    and (s.dispatch_claimed_at is null or s.dispatch_claimed_at<now()-interval '15 minutes')
    and s.automation_kind in ('check_in','review_request','win_back')
    and not (
      exists(select 1 from public.sms_automation_rules r where r.user_id=s.sender_id and
        case s.automation_kind when 'check_in' then r.check_in_reminder_enabled when 'review_request' then r.review_request_enabled when 'win_back' then r.win_back_enabled else false end)
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
                and not exists(select 1 from public.bookings later where later.owner_id=b.owner_id and later.guest_id=b.guest_id and later.check_in>b.check_out))
            )
        )
        or exists(
          select 1 from public.manual_bookings mb join public.properties p on p.id=mb.property_id
          where mb.id=s.source_manual_booking_id and mb.owner_id=s.sender_id and coalesce(p.is_for_sale,false)=false
            and public.sms_canonical_ge_phone(mb.guest_phone)=public.sms_canonical_ge_phone(s.recipient_phone)
            and (
              (s.automation_kind='check_in' and mb.status<>'cancelled' and mb.check_in=(now() at time zone 'Asia/Tbilisi')::date+1)
              or (s.automation_kind='review_request' and mb.status<>'cancelled' and mb.marketing_consent
                and mb.check_out=(now() at time zone 'Asia/Tbilisi')::date-1
                and not exists(select 1 from public.reviews rv where rv.manual_booking_id=mb.id)
                and not exists(select 1 from public.profiles po where po.marketing_opt_out and public.sms_canonical_ge_phone(po.phone)=public.sms_canonical_ge_phone(mb.guest_phone)))
              or (s.automation_kind='win_back' and mb.status<>'cancelled' and mb.marketing_consent
                and mb.check_out=(now() at time zone 'Asia/Tbilisi')::date-90
                and not exists(select 1 from public.profiles po where po.marketing_opt_out and public.sms_canonical_ge_phone(po.phone)=public.sms_canonical_ge_phone(mb.guest_phone))
                and not exists(select 1 from public.manual_bookings later where later.owner_id=mb.owner_id and public.sms_canonical_ge_phone(later.guest_phone)=public.sms_canonical_ge_phone(mb.guest_phone) and later.check_in>mb.check_out))
            )
        )
      )
    );
  get diagnostics v_n=row_count; return v_n;
end;
$$;

create or replace function public.sms_cancel_ineligible_price_drop()
returns integer language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare v_n integer;
begin
  update public.sms_outbound s set status='failed',dispatch_claim_token=null,dispatch_claimed_at=null,
    provider_response=coalesce(s.provider_response,'{}'::jsonb)||jsonb_build_object('cancelled','price_drop_ineligible')
  where s.status='approved' and s.automation_kind='price_drop' and s.charged_at is null
    and (s.dispatch_claimed_at is null or s.dispatch_claimed_at<now()-interval '15 minutes')
    and not exists(
      select 1 from public.sale_price_drop_events e
      join public.properties pr on pr.id=e.property_id
      join public.sale_price_alert_rules r on r.property_id=e.property_id and r.enabled
      join public.sale_price_alert_subscriptions sub on sub.property_id=e.property_id and sub.subscriber_id=s.recipient_id and sub.active
      join public.profiles profile on profile.id=sub.subscriber_id and not profile.marketing_opt_out
      join auth.users u on u.id=sub.subscriber_id and u.phone_confirmed_at is not null
      where e.id=s.price_drop_event_id and e.status='queued'
        and pr.status='active' and pr.is_for_sale is true and pr.organization_id is null
        and pr.sale_price<e.baseline_price and pr.owner_id=s.sender_id
        and public.sms_canonical_ge_phone(u.phone)=public.sms_canonical_ge_phone(s.recipient_phone)
    );
  get diagnostics v_n=row_count; return v_n;
end;
$$;

create or replace function public.sms_cancel_price_drop_subscription()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if new.active is not true then
    perform pg_advisory_xact_lock(hashtextextended('sms_dispatch_claim',19002));
    update public.sms_outbound s set status='failed',provider_response=coalesce(s.provider_response,'{}'::jsonb)||'{"cancelled":"subscriber_unsubscribed"}'::jsonb
    where s.automation_kind='price_drop' and s.recipient_id=new.subscriber_id and s.status='approved'
      and s.dispatch_claim_token is null
      and s.price_drop_event_id in(select e.id from public.sale_price_drop_events e where e.property_id=new.property_id);
  end if;
  return new;
end;
$$;
drop trigger if exists sms_cancel_price_drop_subscription on public.sale_price_alert_subscriptions;
create trigger sms_cancel_price_drop_subscription after update of active on public.sale_price_alert_subscriptions
for each row when (old.active is distinct from new.active) execute function public.sms_cancel_price_drop_subscription();

alter table public.reviews alter column guest_id drop not null;
alter table public.reviews add column if not exists manual_booking_id uuid references public.manual_bookings(id) on delete set null;
alter table public.reviews add column if not exists guest_name_snapshot text;
create unique index if not exists reviews_one_per_manual_booking on public.reviews(manual_booking_id) where manual_booking_id is not null;

create table if not exists public.manual_booking_review_tokens(
  manual_booking_id uuid primary key references public.manual_bookings(id) on delete cascade,
  token_hash bytea not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.manual_booking_review_tokens enable row level security;

create or replace function public.sms_create_manual_review_token(p_owner_id uuid,p_manual_booking_id uuid)
returns text language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare v_token text;
begin
  if not exists(select 1 from public.manual_bookings mb join public.properties p on p.id=mb.property_id
    where mb.id=p_manual_booking_id and mb.owner_id=p_owner_id and mb.marketing_consent
      and mb.check_out<=(now() at time zone 'Asia/Tbilisi')::date and coalesce(p.is_for_sale,false)=false)
  then raise exception 'manual booking is not review eligible' using errcode='42501'; end if;
  v_token:=encode(gen_random_bytes(32),'hex');
  insert into public.manual_booking_review_tokens(manual_booking_id,token_hash,expires_at,used_at,created_at)
  values(p_manual_booking_id,digest(v_token,'sha256'),now()+interval '30 days',null,now())
  on conflict(manual_booking_id) do update set token_hash=excluded.token_hash,expires_at=excluded.expires_at,used_at=null,created_at=now();
  return v_token;
end;
$$;

create or replace function public.manual_review_token_details(p_token text)
returns jsonb language sql security definer set search_path=public,extensions,pg_temp as $$
  select jsonb_build_object('property_id',mb.property_id,'property_title',p.title,'guest_name',mb.guest_name,'expires_at',t.expires_at)
  from public.manual_booking_review_tokens t join public.manual_bookings mb on mb.id=t.manual_booking_id
  join public.properties p on p.id=mb.property_id
  where t.token_hash=digest(p_token,'sha256') and t.used_at is null and t.expires_at>now()
    and not exists(select 1 from public.reviews r where r.manual_booking_id=mb.id);
$$;

create or replace function public.submit_manual_booking_review(p_token text,p_rating numeric,p_comment text default null)
returns uuid language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare v_token public.manual_booking_review_tokens%rowtype; v_booking public.manual_bookings%rowtype; v_id uuid;
begin
  if p_rating<1 or p_rating>5 then raise exception 'rating must be between 1 and 5' using errcode='22023'; end if;
  select * into v_token from public.manual_booking_review_tokens where token_hash=digest(p_token,'sha256') for update;
  if not found or v_token.used_at is not null or v_token.expires_at<=now() then raise exception 'invalid or expired token' using errcode='22023'; end if;
  select * into v_booking from public.manual_bookings where id=v_token.manual_booking_id;
  insert into public.reviews(property_id,booking_id,manual_booking_id,guest_id,guest_name_snapshot,rating,comment)
  values(v_booking.property_id,null,v_booking.id,null,nullif(btrim(v_booking.guest_name),''),p_rating,nullif(btrim(p_comment),'')) returning id into v_id;
  update public.manual_booking_review_tokens set used_at=now() where manual_booking_id=v_booking.id;
  return v_id;
end;
$$;

revoke all on function public.sms_set_price_drop_rule(uuid,uuid,boolean) from public,anon,authenticated;
revoke all on function public.sms_capture_sale_price_drop() from public,anon,authenticated;
revoke all on function public.sms_materialize_due_price_drop_events(text,integer,uuid[]) from public,anon,authenticated;
revoke all on function public.sms_mark_claim_submitted(uuid,uuid,text,jsonb) from public,anon,authenticated;
revoke all on function public.sms_mark_provider_delivered(text,jsonb) from public,anon,authenticated;
revoke all on function public.sms_cancel_ineligible_price_drop() from public,anon,authenticated;
revoke all on function public.sms_cancel_price_drop_subscription() from public,anon,authenticated;
revoke all on function public.sms_create_manual_review_token(uuid,uuid) from public,anon,authenticated;
revoke all on function public.manual_review_token_details(text) from public,anon,authenticated;
revoke all on function public.submit_manual_booking_review(text,numeric,text) from public,anon,authenticated;
grant execute on function public.sms_set_price_drop_rule(uuid,uuid,boolean) to service_role;
grant execute on function public.sms_materialize_due_price_drop_events(text,integer,uuid[]) to service_role;
grant execute on function public.sms_mark_claim_submitted(uuid,uuid,text,jsonb) to service_role;
grant execute on function public.sms_mark_provider_delivered(text,jsonb) to service_role;
grant execute on function public.sms_cancel_ineligible_price_drop() to service_role;
grant execute on function public.sms_create_manual_review_token(uuid,uuid) to service_role;
grant execute on function public.manual_review_token_details(text) to service_role;
grant execute on function public.submit_manual_booking_review(text,numeric,text) to service_role;

revoke all on table public.sale_price_alert_rules,public.sale_price_alert_subscriptions,public.sale_price_drop_events,public.manual_booking_review_tokens from anon,authenticated;
grant select on public.sale_price_alert_subscriptions to authenticated;

notify pgrst,'reload schema';
