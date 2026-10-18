-- Manual bookings span at most two years (2026-10-13).
--
-- create_manual_booking and update_manual_booking write one calendar_blocks row
-- per night (generate_series) while holding the global SMS-dispatch advisory lock
-- (sms_lock_eligibility_change). Nothing bounded the span, so a check-out in year
-- 9999 asked for millions of rows and held that lock until the statement timeout,
-- repeatable by any owner. create_guest_manual_booking goes through
-- create_manual_booking. The refusal reuses the existing date error (22023,
-- 'არასწორი თარიღები'), which the calendar already words. Staging's longest real
-- manual booking is 13 nights.
--
-- Bodies = the live staging definitions plus one line each; the guard refuses
-- (55000) where a live body differs.

do $guard$
declare
  r record;
begin
  for r in
    select v.fn, v.expected,
           (select md5(p.prosrc) from pg_proc p where p.oid = to_regprocedure(v.fn)) as live
    from (values
      ('public.create_manual_booking(uuid,date,date,text,text,text,integer,numeric,text,text,text,uuid,boolean,numeric,date)', 'cb679c9af8c5aa453540943d4eda3f01'),
      ('public.update_manual_booking(uuid,date,date,text,text,text,integer,numeric,text,text,text,uuid,boolean,numeric,date)', 'd7904dc27bacadebc306fc2ba6cdf6de')
    ) as v(fn, expected)
  loop
    if r.live is distinct from r.expected then
      raise exception 'manual_booking_span_cap: % differs from the reviewed body (md5 %); regenerate this migration from the live definition', r.fn, r.live
        using errcode = '55000';
    end if;
  end loop;
end
$guard$;

CREATE OR REPLACE FUNCTION public.create_manual_booking(p_property_id uuid, p_check_in date, p_check_out date, p_source text DEFAULT NULL::text, p_guest_name text DEFAULT NULL::text, p_guest_phone text DEFAULT NULL::text, p_guests_count integer DEFAULT NULL::integer, p_amount numeric DEFAULT NULL::numeric, p_note text DEFAULT NULL::text, p_status text DEFAULT 'manual'::text, p_client_list text DEFAULT NULL::text, p_renter_guest_id uuid DEFAULT NULL::uuid, p_marketing_consent boolean DEFAULT false, p_deposit_amount numeric DEFAULT NULL::numeric, p_deposit_paid_on date DEFAULT NULL::date)
 RETURNS manual_bookings
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_owner uuid := auth.uid();
  v_row public.manual_bookings%rowtype;
  v_guest_id uuid;
  v_conflict integer;
  v_deposit numeric;
begin
  if v_owner is null then raise exception 'ავტორიზაცია საჭიროა' using errcode = '42501'; end if;
  if p_check_out < p_check_in then raise exception 'არასწორი თარიღები' using errcode = '22023'; end if;
  -- One calendar row per night: a booking spans at most two years.
  if p_check_out - p_check_in > 731 then raise exception 'არასწორი თარიღები' using errcode = '22023'; end if;
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
$function$;

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
  -- One calendar row per night: a booking spans at most two years.
  if p_check_out - p_check_in > 731 then raise exception 'არასწორი თარიღები' using errcode = '22023'; end if;
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
