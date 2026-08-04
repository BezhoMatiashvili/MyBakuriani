-- Manual-booking finances and guest-verified SMS consent.
--
-- This migration is append-only and keeps the legacy p_marketing_consent RPC
-- argument for old clients. The argument is intentionally ignored: only a
-- token response may grant consent, while a phone change automatically revokes
-- it. Check-in reminders remain transactional and therefore consent-free.

alter table public.manual_bookings
  add column if not exists deposit_amount numeric(10,2),
  add column if not exists deposit_paid_on date;

alter table public.manual_bookings
  drop constraint if exists manual_bookings_deposit_check;
alter table public.manual_bookings
  add constraint manual_bookings_deposit_check check (
    (deposit_amount is null and deposit_paid_on is null)
    or
    (
      amount is not null
      and deposit_amount >= 0
      and deposit_amount <= amount
      and (
        (deposit_amount = 0 and deposit_paid_on is null)
        or (deposit_amount > 0 and deposit_paid_on is not null)
      )
    )
  );

create table if not exists public.manual_booking_sms_consents (
  id uuid primary key default gen_random_uuid(),
  manual_booking_id uuid not null references public.manual_bookings(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  token_hash text,
  phone_snapshot text,
  consent_version text not null,
  status text not null,
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  declined_at timestamptz,
  revoked_at timestamptz,
  constraint manual_booking_sms_consents_status_check check (
    status in ('legacy_unverified', 'pending', 'accepted', 'declined', 'revoked')
  ),
  constraint manual_booking_sms_consents_token_hash_check check (
    token_hash is null or token_hash ~ '^[0-9a-f]{64}$'
  ),
  constraint manual_booking_sms_consents_state_check check (
    (status = 'legacy_unverified' and token_hash is null and accepted_at is null and declined_at is null and revoked_at is null)
    or (status = 'pending' and token_hash is not null and accepted_at is null and declined_at is null and revoked_at is null)
    or (status = 'accepted' and token_hash is not null and accepted_at is not null and declined_at is null and revoked_at is null)
    or (status = 'declined' and token_hash is not null and accepted_at is null and declined_at is not null and revoked_at is null)
    or (status = 'revoked' and token_hash is not null and revoked_at is not null)
  )
);

create unique index if not exists manual_booking_sms_consents_token_hash_uidx
  on public.manual_booking_sms_consents (token_hash)
  where token_hash is not null;
create index if not exists manual_booking_sms_consents_booking_created_idx
  on public.manual_booking_sms_consents (manual_booking_id, created_at desc, id desc);
create index if not exists manual_booking_sms_consents_owner_created_idx
  on public.manual_booking_sms_consents (owner_id, created_at desc, id desc);

alter table public.manual_booking_sms_consents enable row level security;
revoke all on table public.manual_booking_sms_consents from public, anon, authenticated;
grant all on table public.manual_booking_sms_consents to service_role;

-- Existing owner-attested checkboxes were never guest verified. Preserve an
-- audit row, withdraw marketing eligibility, and retire only marketing queue
-- entries. A check-in reminder is intentionally left untouched.
insert into public.manual_booking_sms_consents (
  manual_booking_id, owner_id, token_hash, phone_snapshot, consent_version, status
)
select mb.id, mb.owner_id, null, public.sms_canonical_ge_phone(mb.guest_phone),
       'legacy-owner-attested-v1', 'legacy_unverified'
from public.manual_bookings mb
where mb.marketing_consent is true
  and not exists (
    select 1 from public.manual_booking_sms_consents c
    where c.manual_booking_id = mb.id and c.status = 'legacy_unverified'
  );

update public.sms_outbound s
set status = 'failed',
    dispatch_claim_token = null,
    dispatch_claimed_at = null,
    provider_response = coalesce(s.provider_response, '{}'::jsonb)
      || jsonb_build_object('cancelled', 'legacy_unverified_consent')
where s.source_manual_booking_id in (
    select id from public.manual_bookings where marketing_consent is true
  )
  and s.automation_kind in ('review_request', 'win_back')
  and s.status = 'approved'
  and s.charged_at is null
  and (s.dispatch_claimed_at is null
    or s.dispatch_claimed_at < now() - interval '15 minutes');

update public.manual_bookings
set marketing_consent = false, marketing_consent_at = null
where marketing_consent is true;

create or replace function public.manual_booking_sms_consent_guard()
returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if auth.role() = 'authenticated'
    and current_setting('app.manual_booking_sms_consent_write', true) is distinct from 'allowed'
    and (
      new.marketing_consent is distinct from old.marketing_consent
      or new.marketing_consent_at is distinct from old.marketing_consent_at
    )
  then
    raise exception 'SMS consent may only be changed by the guest consent flow'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists manual_booking_sms_consent_guard on public.manual_bookings;
create trigger manual_booking_sms_consent_guard
before update of marketing_consent, marketing_consent_at
on public.manual_bookings
for each row execute function public.manual_booking_sms_consent_guard();

create or replace function public.manual_booking_sms_consent_phone_invalidation()
returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if (
    public.sms_canonical_ge_phone(new.guest_phone)
      is distinct from public.sms_canonical_ge_phone(old.guest_phone)
    or (new.status = 'cancelled' and old.status <> 'cancelled')
  )
  then
    new.marketing_consent := false;
    new.marketing_consent_at := null;
    update public.manual_booking_sms_consents
    set status = 'revoked', revoked_at = coalesce(revoked_at, now())
    where manual_booking_id = old.id
      and token_hash is not null
      and status <> 'revoked';
  end if;
  return new;
end;
$$;

drop trigger if exists manual_booking_sms_consent_phone_invalidation on public.manual_bookings;
create trigger manual_booking_sms_consent_phone_invalidation
before update of guest_phone, status
on public.manual_bookings
for each row execute function public.manual_booking_sms_consent_phone_invalidation();

create or replace function public.issue_manual_booking_sms_consent(
  p_owner_id uuid,
  p_manual_booking_id uuid,
  p_token_hash text,
  p_phone_snapshot text,
  p_consent_version text
) returns public.manual_booking_sms_consents
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_booking public.manual_bookings%rowtype;
  v_row public.manual_booking_sms_consents%rowtype;
  v_phone text;
begin
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid token hash' using errcode = '22023';
  end if;
  if nullif(btrim(p_consent_version), '') is null then
    raise exception 'invalid consent version' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('manual_sms_consent:' || p_manual_booking_id::text, 19003));
  select * into v_booking
  from public.manual_bookings
  where id = p_manual_booking_id and owner_id = p_owner_id
  for update;
  if not found then
    raise exception 'booking not found' using errcode = 'P0002';
  end if;
  if v_booking.status = 'cancelled' then
    raise exception 'cancelled booking' using errcode = '22023';
  end if;

  v_phone := public.sms_canonical_ge_phone(v_booking.guest_phone);
  if v_phone is null or v_phone is distinct from public.sms_canonical_ge_phone(p_phone_snapshot) then
    raise exception 'valid booking phone required' using errcode = '22023';
  end if;

  update public.manual_booking_sms_consents
  set status = 'revoked', revoked_at = coalesce(revoked_at, now())
  where manual_booking_id = p_manual_booking_id
    and token_hash is not null
    and status <> 'revoked';

  -- A replacement link always starts a fresh verification cycle. In
  -- particular, never leave an older accepted answer eligible while the newest
  -- consent row is pending.
  perform set_config('app.manual_booking_sms_consent_write', 'allowed', true);
  update public.manual_bookings
  set marketing_consent = false, marketing_consent_at = null
  where id = p_manual_booking_id and owner_id = p_owner_id;

  update public.sms_outbound s
  set status = 'failed',
      dispatch_claim_token = null,
      dispatch_claimed_at = null,
      provider_response = coalesce(s.provider_response, '{}'::jsonb)
        || jsonb_build_object('cancelled', 'guest_sms_consent_reissued')
  where s.source_manual_booking_id = p_manual_booking_id
    and s.automation_kind in ('review_request', 'win_back')
    and s.status = 'approved'
    and s.charged_at is null
    and (s.dispatch_claimed_at is null
      or s.dispatch_claimed_at < now() - interval '15 minutes');

  insert into public.manual_booking_sms_consents (
    manual_booking_id, owner_id, token_hash, phone_snapshot, consent_version, status
  ) values (
    p_manual_booking_id, p_owner_id, lower(p_token_hash), v_phone,
    btrim(p_consent_version), 'pending'
  ) returning * into v_row;
  return v_row;
end;
$$;

create or replace function public.respond_manual_booking_sms_consent(
  p_token_hash text,
  p_action text
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_consent public.manual_booking_sms_consents%rowtype;
  v_booking public.manual_bookings%rowtype;
  v_status text;
begin
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$'
    or p_action not in ('accept', 'decline', 'revoke')
  then
    raise exception 'invalid consent action' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('sms_dispatch_claim', 19002));
  select * into v_consent
  from public.manual_booking_sms_consents
  where token_hash = lower(p_token_hash) and status <> 'revoked'
  for update;
  if not found then
    raise exception 'invalid consent token' using errcode = 'P0002';
  end if;

  select * into v_booking
  from public.manual_bookings
  where id = v_consent.manual_booking_id and status <> 'cancelled'
  for update;
  if not found then
    raise exception 'invalid consent token' using errcode = 'P0002';
  end if;
  if public.sms_canonical_ge_phone(v_booking.guest_phone)
       is distinct from v_consent.phone_snapshot
  then
    update public.manual_booking_sms_consents
    set status = 'revoked', revoked_at = coalesce(revoked_at, now())
    where id = v_consent.id;
    return null;
  end if;

  perform set_config('app.manual_booking_sms_consent_write', 'allowed', true);
  if p_action = 'accept' then
    v_status := 'accepted';
    update public.manual_booking_sms_consents
    set status = 'accepted', accepted_at = now(), declined_at = null, revoked_at = null
    where id = v_consent.id;
    update public.manual_bookings
    set marketing_consent = true, marketing_consent_at = now()
    where id = v_booking.id;
  elsif p_action = 'decline' then
    v_status := 'declined';
    update public.manual_booking_sms_consents
    set status = 'declined', accepted_at = null, declined_at = now(), revoked_at = null
    where id = v_consent.id;
    update public.manual_bookings
    set marketing_consent = false, marketing_consent_at = null
    where id = v_booking.id;
  else
    v_status := 'revoked';
    update public.manual_booking_sms_consents
    set status = 'revoked', revoked_at = now()
    where id = v_consent.id;
    update public.manual_bookings
    set marketing_consent = false, marketing_consent_at = null
    where id = v_booking.id;
  end if;

  if p_action in ('decline', 'revoke') then
    update public.sms_outbound s
    set status = 'failed',
        dispatch_claim_token = null,
        dispatch_claimed_at = null,
        provider_response = coalesce(s.provider_response, '{}'::jsonb)
          || jsonb_build_object('cancelled', 'guest_sms_consent_' || p_action)
    where s.source_manual_booking_id = v_booking.id
      and s.automation_kind in ('review_request', 'win_back')
      and s.status = 'approved'
      and s.charged_at is null
      and (s.dispatch_claimed_at is null
        or s.dispatch_claimed_at < now() - interval '15 minutes');
  end if;

  return jsonb_build_object(
    'booking_id', v_booking.id,
    'status', v_status,
    'marketing_consent', p_action = 'accept'
  );
end;
$$;

-- Adding defaulted arguments requires dropping the old signatures first;
-- otherwise PostgREST sees ambiguous overloads for every named-argument call.
drop function if exists public.create_manual_booking(uuid,date,date,text,text,text,int,numeric,text,text,text,uuid,boolean);
drop function if exists public.update_manual_booking(uuid,date,date,text,text,text,int,numeric,text,text,text,uuid,boolean);
drop function if exists public.create_guest_manual_booking(uuid,date,date,text,text,text,boolean);

create or replace function public.create_manual_booking(
  p_property_id uuid, p_check_in date, p_check_out date,
  p_source text default null, p_guest_name text default null,
  p_guest_phone text default null, p_guests_count int default null,
  p_amount numeric default null, p_note text default null,
  p_status text default 'manual', p_client_list text default null,
  p_renter_guest_id uuid default null,
  p_marketing_consent boolean default false,
  p_deposit_amount numeric default null,
  p_deposit_paid_on date default null
) returns public.manual_bookings
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_owner uuid := auth.uid();
  v_row public.manual_bookings%rowtype;
  v_guest_id uuid;
  v_conflict integer;
  v_deposit numeric;
begin
  if v_owner is null then raise exception 'ავტორიზაცია საჭიროა' using errcode = '42501'; end if;
  if p_check_out < p_check_in then raise exception 'არასწორი თარიღები' using errcode = '22023'; end if;
  if not exists (select 1 from public.properties where id = p_property_id and owner_id = v_owner) then
    raise exception 'ობიექტი ვერ მოიძებნა ან თქვენ არ ხართ მფლობელი' using errcode = '42501';
  end if;

  v_deposit := case
    when p_deposit_amount is not null then p_deposit_amount
    when p_amount is not null then 0
    else null
  end;
  if (v_deposit is not null and (p_amount is null or v_deposit < 0 or v_deposit > p_amount))
    or (v_deposit > 0 and p_deposit_paid_on is null)
    or (coalesce(v_deposit, 0) = 0 and p_deposit_paid_on is not null)
  then
    raise exception 'არასწორი ბეს მონაცემები' using errcode = '22023';
  end if;

  if p_renter_guest_id is not null then
    select id into v_guest_id from public.renter_guests
    where id = p_renter_guest_id and owner_id = v_owner;
    if v_guest_id is null then raise exception 'სტუმარი ვერ მოიძებნა' using errcode = '42501'; end if;
  else
    v_guest_id := public.ensure_renter_guest(v_owner, p_guest_name, p_guest_phone);
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_property_id::text, 0));
  select count(*) into v_conflict from public.calendar_blocks
  where property_id = p_property_id and date between p_check_in and p_check_out
    and status in ('booked', 'blocked');
  if v_conflict > 0 then raise exception 'არჩეული თარიღები დაკავებულია' using errcode = '22023'; end if;

  insert into public.manual_bookings (
    owner_id, property_id, check_in, check_out, source, guest_name, guest_phone,
    guests_count, amount, deposit_amount, deposit_paid_on, note, status,
    client_list, renter_guest_id, marketing_consent, marketing_consent_at
  ) values (
    v_owner, p_property_id, p_check_in, p_check_out, p_source,
    nullif(btrim(p_guest_name), ''), nullif(btrim(p_guest_phone), ''),
    p_guests_count, p_amount, v_deposit, p_deposit_paid_on, p_note,
    case when p_status = 'booked' then 'booked' else 'manual' end,
    p_client_list, v_guest_id, false, null
  ) returning * into v_row;

  insert into public.calendar_blocks (property_id, date, status, booking_id)
  select p_property_id, d::date, 'booked', v_row.id
  from generate_series(p_check_in, p_check_out, interval '1 day') d
  on conflict (property_id, date) do update set status = 'booked', booking_id = v_row.id
    where public.calendar_blocks.status = 'available';
  return v_row;
end;
$$;

create or replace function public.update_manual_booking(
  p_id uuid, p_check_in date, p_check_out date,
  p_source text default null, p_guest_name text default null,
  p_guest_phone text default null, p_guests_count int default null,
  p_amount numeric default null, p_note text default null,
  p_status text default 'manual', p_client_list text default null,
  p_renter_guest_id uuid default null,
  p_marketing_consent boolean default null,
  -- -1 is the omission sentinel for old clients; explicit NULL clears a deposit.
  p_deposit_amount numeric default -1,
  p_deposit_paid_on date default null
) returns public.manual_bookings
language plpgsql security definer set search_path = public, pg_temp as $$
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
    and (s.dispatch_claimed_at is null or s.dispatch_claimed_at < now() - interval '15 minutes');

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
$$;

create or replace function public.create_guest_manual_booking(
  p_property_id uuid, p_check_in date, p_check_out date, p_name text,
  p_phone text default null, p_note text default null,
  p_marketing_consent boolean default false,
  p_amount numeric default null,
  p_deposit_amount numeric default null,
  p_deposit_paid_on date default null
) returns public.manual_bookings
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_guest_id uuid;
  v_owner uuid := auth.uid();
  v_booking public.manual_bookings;
begin
  if v_owner is null then raise exception 'ავტორიზაცია საჭიროა' using errcode = '42501'; end if;
  v_guest_id := public.ensure_renter_guest(v_owner, p_name, p_phone);
  select * into v_booking from public.create_manual_booking(
    p_property_id       => p_property_id,
    p_check_in          => p_check_in,
    p_check_out         => p_check_out,
    p_source            => null,
    p_guest_name        => p_name,
    p_guest_phone       => p_phone,
    p_guests_count      => null,
    p_amount            => p_amount,
    p_note              => p_note,
    p_status            => 'manual',
    p_client_list       => null,
    p_renter_guest_id   => v_guest_id,
    p_marketing_consent => false,
    p_deposit_amount    => p_deposit_amount,
    p_deposit_paid_on   => p_deposit_paid_on
  );
  update public.renter_guests set visit_dates = null where id = v_guest_id;
  return v_booking;
end;
$$;

revoke all on function public.issue_manual_booking_sms_consent(uuid,uuid,text,text,text) from public, anon, authenticated;
revoke all on function public.respond_manual_booking_sms_consent(text,text) from public, anon, authenticated;
grant execute on function public.issue_manual_booking_sms_consent(uuid,uuid,text,text,text) to service_role;
grant execute on function public.respond_manual_booking_sms_consent(text,text) to service_role;

revoke all on function public.create_manual_booking(uuid,date,date,text,text,text,int,numeric,text,text,text,uuid,boolean,numeric,date) from public;
revoke all on function public.update_manual_booking(uuid,date,date,text,text,text,int,numeric,text,text,text,uuid,boolean,numeric,date) from public;
revoke all on function public.create_guest_manual_booking(uuid,date,date,text,text,text,boolean,numeric,numeric,date) from public;
grant execute on function public.create_manual_booking(uuid,date,date,text,text,text,int,numeric,text,text,text,uuid,boolean,numeric,date) to authenticated;
grant execute on function public.update_manual_booking(uuid,date,date,text,text,text,int,numeric,text,text,text,uuid,boolean,numeric,date) to authenticated;
grant execute on function public.create_guest_manual_booking(uuid,date,date,text,text,text,boolean,numeric,numeric,date) to authenticated;

notify pgrst, 'reload schema';
