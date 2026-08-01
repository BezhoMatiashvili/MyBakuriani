-- Production-safe SMS queue: strict recipients, atomic credit capacity,
-- current-state revalidation, and dispatch claim leases.

alter table public.sms_outbound
  add column if not exists dispatch_claim_token uuid,
  add column if not exists dispatch_claimed_at timestamptz,
  add column if not exists dispatch_attempt_count integer not null default 0;

alter table public.sms_outbound
  drop constraint if exists sms_outbound_dispatch_attempt_nonnegative;
alter table public.sms_outbound
  add constraint sms_outbound_dispatch_attempt_nonnegative
  check (dispatch_attempt_count >= 0);

create index if not exists idx_sms_outbound_dispatch_claim
  on public.sms_outbound (dispatch_claimed_at)
  where status = 'approved';

create or replace function public.sms_canonical_ge_phone(p text)
returns text
language sql immutable
set search_path = public, pg_temp
as $$
  with digits as (
    select regexp_replace(coalesce(p, ''), '\D', '', 'g') as value
  ), local as (
    select case
      when length(value) = 12 and left(value, 3) = '995' then substring(value from 4)
      when length(value) = 9 then value
      else null
    end as value
    from digits
  )
  select case when value ~ '^5[0-9]{8}$' then '+995' || value else null end
  from local;
$$;

create or replace function public.sms_enqueue_automation(
  p_sender_id         uuid,
  p_recipient_id      uuid,
  p_recipient_phone   text,
  p_kind              text,
  p_message           text,
  p_booking_id        uuid default null,
  p_manual_booking_id uuid default null
) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_id uuid;
  v_phone text;
  v_credits integer;
  v_active integer;
begin
  if p_kind is null or p_kind not in ('check_in','review_request','win_back') then
    raise exception 'invalid automation kind: %', p_kind using errcode = '22023';
  end if;
  if (p_booking_id is null) = (p_manual_booking_id is null) then
    raise exception 'exactly one booking source is required' using errcode = '22023';
  end if;
  if p_sender_id is null or nullif(btrim(p_message), '') is null then
    raise exception 'sender_id and message are required' using errcode = '22023';
  end if;

  v_phone := public.sms_canonical_ge_phone(p_recipient_phone);
  if v_phone is null then return null; end if;

  -- Serialize capacity checks per sender without reserving or deducting credit.
  perform pg_advisory_xact_lock(hashtextextended(p_sender_id::text, 19001));

  if p_booking_id is not null and exists (
    select 1 from public.sms_outbound
    where sender_id = p_sender_id and source_booking_id = p_booking_id
      and automation_kind = p_kind
  ) then return null; end if;
  if p_manual_booking_id is not null and exists (
    select 1 from public.sms_outbound
    where sender_id = p_sender_id and source_manual_booking_id = p_manual_booking_id
      and automation_kind = p_kind
  ) then return null; end if;

  select coalesce(sms_remaining, 0) into v_credits
  from public.balances where user_id = p_sender_id;
  v_credits := coalesce(v_credits, 0);

  select count(*)::integer into v_active
  from public.sms_outbound s
  where s.sender_id = p_sender_id
    and s.status = 'approved'
    and s.charged_at is null
    and (s.automation_kind in ('check_in','review_request','win_back')) is true;

  if v_active >= v_credits then return null; end if;

  if p_booking_id is not null then
    insert into public.sms_outbound (
      sender_id, recipient_id, recipient_phone, contact_event_id, broadcast_id,
      automation_kind, source_booking_id, message, status
    ) values (
      p_sender_id, p_recipient_id, v_phone, null, null,
      p_kind, p_booking_id, left(p_message, 320), 'approved'
    )
    on conflict (sender_id, source_booking_id, automation_kind)
      where automation_kind is not null and source_booking_id is not null
      do nothing
    returning id into v_id;
  else
    insert into public.sms_outbound (
      sender_id, recipient_id, recipient_phone, contact_event_id, broadcast_id,
      automation_kind, source_manual_booking_id, message, status
    ) values (
      p_sender_id, p_recipient_id, v_phone, null, null,
      p_kind, p_manual_booking_id, left(p_message, 320), 'approved'
    )
    on conflict (sender_id, source_manual_booking_id, automation_kind)
      where automation_kind is not null and source_manual_booking_id is not null
      do nothing
    returning id into v_id;
  end if;
  return v_id;
end;
$$;

create or replace function public.sms_cancel_queued_automation(
  p_sender_id uuid,
  p_kind text,
  p_reason text default 'configuration_changed'
) returns integer
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_n integer;
begin
  if p_kind not in ('check_in','review_request','win_back') then
    raise exception 'invalid automation kind' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('sms_dispatch_claim', 19002));
  update public.sms_outbound
  set status = 'failed',
      dispatch_claim_token = null,
      dispatch_claimed_at = null,
      provider_response = coalesce(provider_response, '{}'::jsonb)
        || jsonb_build_object('cancelled', coalesce(nullif(p_reason, ''), 'configuration_changed'))
  where sender_id = p_sender_id
    and automation_kind = p_kind
    and status = 'approved'
    and charged_at is null
    and (dispatch_claimed_at is null
      or dispatch_claimed_at < now() - interval '15 minutes');
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

-- Atomically persist the owner-facing controls and invalidate messages built
-- from the previous configuration. The dispatch lock closes the otherwise
-- unavoidable race between changing a discount and claiming the old text.
create or replace function public.sms_set_automation_rules(
  p_sender_id uuid,
  p_check_in_enabled boolean,
  p_review_enabled boolean,
  p_win_back_enabled boolean,
  p_discount_value text,
  p_discount_period text
) returns public.sms_automation_rules
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_old public.sms_automation_rules%rowtype;
  v_new public.sms_automation_rules%rowtype;
begin
  if p_sender_id is null then
    raise exception 'sender is required' using errcode = '22023';
  end if;
  if char_length(coalesce(p_discount_value, '')) > 10
     or char_length(coalesce(p_discount_period, '')) > 30 then
    raise exception 'discount fields are too long' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('sms_dispatch_claim', 19002));
  select * into v_old from public.sms_automation_rules
  where user_id = p_sender_id for update;

  insert into public.sms_automation_rules (
    user_id, check_in_reminder_enabled, review_request_enabled,
    win_back_enabled, win_back_discount_value, win_back_discount_period,
    check_in_reminder_hours_before, review_request_hours_after,
    win_back_days_after
  ) values (
    p_sender_id, coalesce(p_check_in_enabled, false),
    coalesce(p_review_enabled, false), coalesce(p_win_back_enabled, false),
    nullif(btrim(p_discount_value), ''), nullif(btrim(p_discount_period), ''),
    24, 24, 90
  )
  on conflict (user_id) do update set
    check_in_reminder_enabled = excluded.check_in_reminder_enabled,
    review_request_enabled = excluded.review_request_enabled,
    win_back_enabled = excluded.win_back_enabled,
    win_back_discount_value = excluded.win_back_discount_value,
    win_back_discount_period = excluded.win_back_discount_period,
    check_in_reminder_hours_before = 24,
    review_request_hours_after = 24,
    win_back_days_after = 90,
    updated_at = now()
  returning * into v_new;

  if found and v_old.check_in_reminder_enabled is distinct from v_new.check_in_reminder_enabled then
    perform public.sms_cancel_queued_automation(p_sender_id, 'check_in', 'configuration_changed');
  end if;
  if found and v_old.review_request_enabled is distinct from v_new.review_request_enabled then
    perform public.sms_cancel_queued_automation(p_sender_id, 'review_request', 'configuration_changed');
  end if;
  if found and (
    v_old.win_back_enabled is distinct from v_new.win_back_enabled
    or v_old.win_back_discount_value is distinct from v_new.win_back_discount_value
    or v_old.win_back_discount_period is distinct from v_new.win_back_discount_period
  ) then
    perform public.sms_cancel_queued_automation(p_sender_id, 'win_back', 'configuration_changed');
  end if;
  return v_new;
end;
$$;

create or replace function public.sms_cancel_ineligible_automation()
returns integer
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_n integer;
begin
  update public.sms_outbound s
  set status = 'failed',
      dispatch_claim_token = null,
      dispatch_claimed_at = null,
      provider_response = coalesce(s.provider_response, '{}'::jsonb)
        || jsonb_build_object('cancelled', 'eligibility_changed')
  where s.status = 'approved'
    and s.charged_at is null
    and (s.dispatch_claimed_at is null
      or s.dispatch_claimed_at < now() - interval '15 minutes')
    and (s.automation_kind in ('check_in','review_request','win_back')) is true
    and not (
      exists (
        select 1 from public.sms_automation_rules r
        where r.user_id = s.sender_id
          and case s.automation_kind
            when 'check_in' then r.check_in_reminder_enabled
            when 'review_request' then r.review_request_enabled
            when 'win_back' then r.win_back_enabled
            else false
          end
      )
      and (
        exists (
          select 1
          from public.bookings b
          join public.properties p on p.id = b.property_id
          where b.id = s.source_booking_id
            and b.owner_id = s.sender_id
            and coalesce(p.is_for_sale, false) = false
            and (
              (s.automation_kind = 'check_in'
                and b.status = 'confirmed'
                and b.check_in = (now() at time zone 'Asia/Tbilisi')::date + 1)
              or
              (s.automation_kind = 'review_request'
                and b.status = 'completed'
                and b.marketing_consent
                and b.check_out = (now() at time zone 'Asia/Tbilisi')::date - 1
                and not exists (select 1 from public.reviews rv where rv.booking_id = b.id)
                and not exists (
                  select 1 from public.profiles po
                  where po.marketing_opt_out
                    and public.sms_canonical_ge_phone(po.phone) = public.sms_canonical_ge_phone(s.recipient_phone)
                ))
              or
              (s.automation_kind = 'win_back'
                and b.status = 'completed'
                and b.marketing_consent
                and b.check_out = (now() at time zone 'Asia/Tbilisi')::date - 90
                and not exists (
                  select 1 from public.profiles po
                  where po.marketing_opt_out
                    and public.sms_canonical_ge_phone(po.phone) = public.sms_canonical_ge_phone(s.recipient_phone)
                )
                and not exists (
                  select 1 from public.bookings later
                  where later.owner_id = b.owner_id
                    and later.guest_id = b.guest_id
                    and later.check_in > b.check_out
                ))
            )
        )
        or exists (
          select 1
          from public.manual_bookings mb
          join public.properties p on p.id = mb.property_id
          where mb.id = s.source_manual_booking_id
            and mb.owner_id = s.sender_id
            and coalesce(p.is_for_sale, false) = false
            and (
              (s.automation_kind = 'check_in'
                and mb.status <> 'cancelled'
                and mb.check_in = (now() at time zone 'Asia/Tbilisi')::date + 1)
              or
              (s.automation_kind = 'win_back'
                and mb.status <> 'cancelled'
                and mb.marketing_consent
                and mb.check_out = (now() at time zone 'Asia/Tbilisi')::date - 90
                and not exists (
                  select 1 from public.profiles po
                  where po.marketing_opt_out
                    and public.sms_canonical_ge_phone(po.phone) = public.sms_canonical_ge_phone(s.recipient_phone)
                )
                and not exists (
                  select 1 from public.manual_bookings later
                  where later.owner_id = mb.owner_id
                    and public.sms_canonical_ge_phone(later.guest_phone) = public.sms_canonical_ge_phone(mb.guest_phone)
                    and later.check_in > mb.check_out
                ))
            )
        )
      )
    );
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

create or replace function public.sms_claim_dispatch_batch(
  p_claim_token uuid,
  p_limit integer default 25
) returns table (id uuid, recipient_phone text, message text)
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if p_claim_token is null then
    raise exception 'claim token is required' using errcode = '22023';
  end if;
  if not pg_try_advisory_xact_lock(hashtextextended('sms_dispatch_claim', 19002)) then
    return;
  end if;

  -- Revalidate while holding the same lock used by every eligibility-changing
  -- write. This makes claim time the exact, auditable eligibility boundary.
  perform public.sms_cancel_ineligible_automation();

  return query
  with active_claims as (
    select s.sender_id, count(*)::integer as count
    from public.sms_outbound s
    where s.status = 'approved'
      and s.charged_at is null
      and (s.automation_kind in ('check_in','review_request','win_back')) is true
      and s.dispatch_claimed_at >= now() - interval '15 minutes'
    group by s.sender_id
  ), candidates as (
    select s.id, s.sender_id, s.created_at,
      (s.automation_kind in ('check_in','review_request','win_back')) is true as chargeable
    from public.sms_outbound s
    where s.status = 'approved'
      and s.charged_at is null
      and (s.dispatch_claimed_at is null
        or s.dispatch_claimed_at < now() - interval '15 minutes')
  ), ranked as (
    select c.*,
      row_number() over (
        partition by c.sender_id, c.chargeable order by c.created_at, c.id
      ) as rn
    from candidates c
  ), chosen as (
    select r.id
    from ranked r
    left join public.balances b on b.user_id = r.sender_id
    left join active_claims a on a.sender_id = r.sender_id
    where r.chargeable is not true
       or r.rn <= greatest(coalesce(b.sms_remaining, 0) - coalesce(a.count, 0), 0)
    order by r.created_at, r.id
    limit greatest(coalesce(p_limit, 25), 0)
  ), claimed as (
    update public.sms_outbound s
    set dispatch_claim_token = p_claim_token,
        dispatch_claimed_at = now(),
        dispatch_attempt_count = s.dispatch_attempt_count + 1
    from chosen c
    where s.id = c.id
    returning s.id, s.recipient_phone, s.message
  )
  select c.id, c.recipient_phone, c.message from claimed c;
end;
$$;

create or replace function public.sms_mark_claim_sent(
  p_sms_id uuid,
  p_claim_token uuid,
  p_provider_response jsonb default null
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_row public.sms_outbound%rowtype;
  v_remaining integer;
  v_charged boolean := false;
  v_reason text := null;
begin
  select * into v_row
  from public.sms_outbound
  where id = p_sms_id and status = 'approved'
    and dispatch_claim_token = p_claim_token
  for update;
  if not found then
    raise exception 'sms claim not found' using errcode = 'P0002';
  end if;

  if v_row.automation_kind in ('check_in','review_request','win_back')
     and v_row.charged_at is null then
    select sms_remaining into v_remaining
    from public.balances where user_id = v_row.sender_id for update;
    if found and coalesce(v_remaining, 0) >= 1 then
      update public.balances
      set sms_remaining = v_remaining - 1, updated_at = now()
      where user_id = v_row.sender_id;
      insert into public.transactions (user_id, amount, type, description, reference_id)
      values (
        v_row.sender_id, 0, 'sms_send'::public.transaction_type,
        format('SMS გაგზავნილია (%s): %s', v_row.automation_kind, v_row.recipient_phone),
        p_sms_id
      );
      v_charged := true;
    else
      v_reason := 'insufficient_credit';
    end if;
  end if;

  update public.sms_outbound
  set status = 'sent', sent_at = now(),
      charged_at = case when v_charged then now() else charged_at end,
      provider_response = coalesce(p_provider_response, '{}'::jsonb)
        || case when v_reason is null then '{}'::jsonb
                else jsonb_build_object('uncharged', v_reason) end
  where id = p_sms_id and dispatch_claim_token = p_claim_token;

  return jsonb_build_object('charged', v_charged, 'uncharged_reason', v_reason);
end;
$$;

create or replace function public.sms_mark_claim_failed(
  p_sms_id uuid,
  p_claim_token uuid,
  p_provider_response jsonb default null
) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update public.sms_outbound
  set status = 'failed',
      provider_response = coalesce(p_provider_response, '{}'::jsonb)
  where id = p_sms_id and status = 'approved'
    and dispatch_claim_token = p_claim_token;
  if not found then
    raise exception 'sms claim not found' using errcode = 'P0002';
  end if;
end;
$$;

create or replace function public.sms_release_dispatch_claim(
  p_sms_id uuid,
  p_claim_token uuid
) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update public.sms_outbound
  set dispatch_claim_token = null, dispatch_claimed_at = null
  where id = p_sms_id and status = 'approved'
    and dispatch_claim_token = p_claim_token;
end;
$$;

create or replace function public.sms_cancel_property_queue()
returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('sms_dispatch_claim', 19002));
  if old.is_for_sale is distinct from new.is_for_sale
     or old.check_in_time is distinct from new.check_in_time
     or old.location_lat is distinct from new.location_lat
     or old.location_lng is distinct from new.location_lng
     or old.phone is distinct from new.phone
     or old.type is distinct from new.type then
    update public.sms_outbound s
    set status = 'failed',
        dispatch_claim_token = null,
        dispatch_claimed_at = null,
        provider_response = coalesce(s.provider_response, '{}'::jsonb)
          || jsonb_build_object('cancelled', 'property_changed')
    where s.status = 'approved' and s.charged_at is null
      and (s.dispatch_claimed_at is null
        or s.dispatch_claimed_at < now() - interval '15 minutes')
      and (s.automation_kind in ('check_in','review_request','win_back')) is true
      and (
        s.source_booking_id in (select b.id from public.bookings b where b.property_id = new.id)
        or s.source_manual_booking_id in (
          select mb.id from public.manual_bookings mb where mb.property_id = new.id
        )
      );
  end if;
  return new;
end;
$$;

-- Writers that can change consent, dates, status, recipient identity, review
-- state, or re-booking state serialize with dispatch. A row already claimed is
-- deliberately past the cancellation boundary; the provider may be processing
-- it, so changing it to failed would only hide a real delivery.
create or replace function public.sms_lock_eligibility_change()
returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('sms_dispatch_claim', 19002));
  return null;
end;
$$;

drop trigger if exists sms_lock_booking_eligibility_write on public.bookings;
create trigger sms_lock_booking_eligibility_write
before insert or delete or update
on public.bookings for each statement
execute function public.sms_lock_eligibility_change();

drop trigger if exists sms_lock_manual_booking_eligibility_write on public.manual_bookings;
create trigger sms_lock_manual_booking_eligibility_write
before insert or delete or update
on public.manual_bookings for each statement
execute function public.sms_lock_eligibility_change();

drop trigger if exists sms_lock_review_eligibility_write on public.reviews;
create trigger sms_lock_review_eligibility_write
before insert or delete or update
on public.reviews for each statement
execute function public.sms_lock_eligibility_change();

drop trigger if exists sms_lock_profile_opt_out_write on public.profiles;
create trigger sms_lock_profile_opt_out_write
before update of phone, marketing_opt_out
on public.profiles for each statement
execute function public.sms_lock_eligibility_change();

drop trigger if exists sms_lock_property_eligibility_write on public.properties;
create trigger sms_lock_property_eligibility_write
before update of is_for_sale, check_in_time, location_lat, location_lng, phone, type
on public.properties for each statement
execute function public.sms_lock_eligibility_change();

drop trigger if exists sms_cancel_property_queue on public.properties;
create trigger sms_cancel_property_queue
after update of is_for_sale, check_in_time, location_lat, location_lng, phone, type
on public.properties
for each row execute function public.sms_cancel_property_queue();

-- Preserve existing consent when an older client omits the argument; explicit
-- false still withdraws consent and clears its timestamp.
create or replace function public.update_manual_booking(
  p_id uuid, p_check_in date, p_check_out date,
  p_source text default null, p_guest_name text default null,
  p_guest_phone text default null, p_guests_count int default null,
  p_amount numeric default null, p_note text default null,
  p_status text default 'manual', p_client_list text default null,
  p_renter_guest_id uuid default null,
  p_marketing_consent boolean default null
) returns manual_bookings
language plpgsql security definer set search_path = public as $$
declare
  v_owner uuid := auth.uid(); v_existing manual_bookings%rowtype;
  v_row manual_bookings%rowtype; v_guest_id uuid; v_conflict int;
  v_consent boolean;
begin
  if v_owner is null then raise exception 'ავტორიზაცია საჭიროა' using errcode = '42501'; end if;
  if p_check_out < p_check_in then raise exception 'არასწორი თარიღები' using errcode = '22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended('sms_dispatch_claim', 19002));
  select * into v_existing from manual_bookings where id = p_id and owner_id = v_owner;
  if not found then raise exception 'ჯავშანი ვერ მოიძებნა' using errcode = 'P0002'; end if;

  if p_renter_guest_id is not null then
    select id into v_guest_id from renter_guests where id = p_renter_guest_id and owner_id = v_owner;
    if v_guest_id is null then raise exception 'სტუმარი ვერ მოიძებნა' using errcode = '42501'; end if;
  elsif v_existing.renter_guest_id is not null then
    v_guest_id := v_existing.renter_guest_id;
  else
    v_guest_id := ensure_renter_guest(v_owner, p_guest_name, p_guest_phone);
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_existing.property_id::text, 0));
  select count(*) into v_conflict from calendar_blocks
  where property_id = v_existing.property_id and date between p_check_in and p_check_out
    and status in ('booked', 'blocked') and booking_id is distinct from p_id;
  if v_conflict > 0 then raise exception 'არჩეული თარიღები დაკავებულია' using errcode = '22023'; end if;

  v_consent := coalesce(p_marketing_consent, v_existing.marketing_consent, false);
  update public.sms_outbound s
  set status = 'failed',
      dispatch_claim_token = null,
      dispatch_claimed_at = null,
      provider_response = coalesce(s.provider_response, '{}'::jsonb)
        || jsonb_build_object('cancelled', 'manual_booking_changed')
  where s.source_manual_booking_id = p_id and s.status = 'approved'
    and s.charged_at is null
    and (s.dispatch_claimed_at is null
      or s.dispatch_claimed_at < now() - interval '15 minutes');

  delete from calendar_blocks where booking_id = p_id;
  update manual_bookings set check_in = p_check_in, check_out = p_check_out, source = p_source,
    guest_name = nullif(btrim(p_guest_name), ''), guest_phone = nullif(btrim(p_guest_phone), ''),
    guests_count = p_guests_count, amount = p_amount, note = p_note,
    status = case when p_status = 'booked' then 'booked' else 'manual' end,
    client_list = p_client_list, renter_guest_id = v_guest_id,
    marketing_consent = v_consent,
    marketing_consent_at = case
      when v_consent then coalesce(v_existing.marketing_consent_at, now())
      else null end
  where id = p_id and owner_id = v_owner returning * into v_row;
  insert into calendar_blocks (property_id, date, status, booking_id)
  select v_existing.property_id, d::date, 'booked', p_id
  from generate_series(p_check_in, p_check_out, interval '1 day') d
  on conflict (property_id, date) do update set status = 'booked', booking_id = p_id
    where calendar_blocks.status = 'available';
  return v_row;
end;
$$;

revoke all on function public.sms_enqueue_automation(uuid,uuid,text,text,text,uuid,uuid)
  from public, anon, authenticated;
grant execute on function public.sms_enqueue_automation(uuid,uuid,text,text,text,uuid,uuid)
  to service_role;
revoke all on function public.sms_cancel_queued_automation(uuid,text,text)
  from public, anon, authenticated;
grant execute on function public.sms_cancel_queued_automation(uuid,text,text)
  to service_role;
revoke all on function public.sms_set_automation_rules(uuid,boolean,boolean,boolean,text,text)
  from public, anon, authenticated;
grant execute on function public.sms_set_automation_rules(uuid,boolean,boolean,boolean,text,text)
  to service_role;
revoke all on function public.sms_cancel_ineligible_automation()
  from public, anon, authenticated;
grant execute on function public.sms_cancel_ineligible_automation()
  to service_role;
revoke all on function public.sms_claim_dispatch_batch(uuid,integer)
  from public, anon, authenticated;
grant execute on function public.sms_claim_dispatch_batch(uuid,integer)
  to service_role;
revoke all on function public.sms_mark_claim_sent(uuid,uuid,jsonb)
  from public, anon, authenticated;
grant execute on function public.sms_mark_claim_sent(uuid,uuid,jsonb)
  to service_role;
revoke all on function public.sms_mark_claim_failed(uuid,uuid,jsonb)
  from public, anon, authenticated;
grant execute on function public.sms_mark_claim_failed(uuid,uuid,jsonb)
  to service_role;
revoke all on function public.sms_release_dispatch_claim(uuid,uuid)
  from public, anon, authenticated;
grant execute on function public.sms_release_dispatch_claim(uuid,uuid)
  to service_role;
revoke all on function public.sms_cancel_property_queue()
  from public, anon, authenticated;
revoke all on function public.sms_lock_eligibility_change()
  from public, anon, authenticated;

revoke execute on function public.sms_dispatch_batch(integer) from service_role;
revoke execute on function public.sms_mark_sent(uuid,jsonb) from service_role;
revoke execute on function public.sms_mark_failed(uuid,jsonb) from service_role;

revoke all on function public.update_manual_booking(uuid,date,date,text,text,text,int,numeric,text,text,text,uuid,boolean)
  from public;
grant execute on function public.update_manual_booking(uuid,date,date,text,text,text,int,numeric,text,text,text,uuid,boolean)
  to authenticated;

notify pgrst, 'reload schema';
