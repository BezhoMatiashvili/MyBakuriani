-- Security hardening S2-A (2026-09-27). Function bodies are the live staging definitions with
-- only the marked lines changed. S03: Smart Match requests from a browser session are limited to
-- the form's fields, a known zone and a per-guest cap before the owner fan-out trigger runs.
-- S08: price-drop delivery charges stop copying the subscriber's number into the owner's wallet
-- history. D7: manual-booking cancel/restore/update authorize before taking the global SMS lock,
-- and anon loses its unused write grants on manual_bookings.

-- Precondition: the four replaced functions must still have the exact bodies reviewed on
-- staging (md5 of prosrc); otherwise stop instead of overwriting a newer or hotfixed body.
DO $guard$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT v.fn, v.expected,
           (SELECT md5(p.prosrc) FROM pg_proc p WHERE p.oid = to_regprocedure(v.fn)) AS live
    FROM (VALUES
      ('public.sms_mark_provider_delivered(text,jsonb)', '8d4f94c36c3740252e0f08d33bfe4d56'),
      ('public.cancel_manual_booking(uuid)', '5e46b792ca9b80b90f7531026299254c'),
      ('public.restore_manual_booking(uuid)', '1be9176ab4bfa8d204f18ee7d1900479'),
      ('public.update_manual_booking(uuid,date,date,text,text,text,integer,numeric,text,text,text,uuid,boolean,numeric,date)', '4f815a712d9b3256c4ce1c54d7c8fe9c')
    ) AS v(fn, expected)
  LOOP
    IF r.live IS DISTINCT FROM r.expected THEN
      RAISE EXCEPTION 'S2-A: % differs from the reviewed body (md5 %); regenerate this migration from the live definition', r.fn, r.live;
    END IF;
  END LOOP;
END
$guard$;

-- S03. Client-created Smart Match requests: status must be 'active' on create and may only
-- move to 'cancelled' afterwards (the only two values the guest UI writes); zone must be NULL
-- (all zones) or an existing zones.name_ka, the only values the request form offers; at most
-- 5 open requests (C15's not-stale predicate) and 10 creations per rolling 24 h per guest,
-- serialized per guest. service_role / server writers are exempt. Errors are 22023, which the
-- form already shows as its generic submit error.
CREATE OR REPLACE FUNCTION public.enforce_smart_match_request_rules()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  c_max_open constant integer := 5;
  c_max_per_24h constant integer := 10;
  v_role text;
  v_open integer;
  v_recent integer;
begin
  begin
    v_role := auth.role();
  exception when others then
    v_role := null;
  end;
  if v_role is null or v_role = 'service_role' then
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if new.status is distinct from old.status and new.status is distinct from 'cancelled' then
      raise exception 'smart match request can only be cancelled' using errcode = '22023';
    end if;
    return new;
  end if;

  if new.status is distinct from 'active' then
    raise exception 'smart match request must be created active' using errcode = '22023';
  end if;
  if new.zone is not null
     and not exists (select 1 from public.zones z where z.name_ka = new.zone) then
    raise exception 'smart match zone is not a known zone' using errcode = '22023';
  end if;

  if new.guest_id is distinct from auth.uid() then
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('smart-match-request:' || new.guest_id::text, 0));
  select
    count(*) filter (where r.status = 'active'
      and (r.check_out is null or r.check_out >= (now() at time zone 'utc')::date)),
    count(*) filter (where r.created_at > now() - interval '24 hours')
  into v_open, v_recent
  from public.smart_match_requests r
  where r.guest_id = new.guest_id;

  if v_open >= c_max_open or v_recent >= c_max_per_24h then
    raise exception 'smart match request limit reached' using errcode = '22023';
  end if;
  return new;
end;
$function$;

REVOKE ALL ON FUNCTION public.enforce_smart_match_request_rules() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_enforce_smart_match_request_rules ON public.smart_match_requests;

CREATE TRIGGER trg_enforce_smart_match_request_rules BEFORE INSERT OR UPDATE ON public.smart_match_requests FOR EACH ROW EXECUTE FUNCTION public.enforce_smart_match_request_rules();

-- Column-level client writes (C34): exactly the keys both request forms insert, and status
-- for cancel. REVOKE first so only the column grants remain in effect.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.smart_match_requests FROM anon;

REVOKE INSERT, UPDATE, TRUNCATE ON public.smart_match_requests FROM authenticated;

GRANT INSERT (guest_id, check_in, check_out, guests_count, budget_min, budget_max, zone, status) ON public.smart_match_requests TO authenticated;

GRANT UPDATE (status) ON public.smart_match_requests TO authenticated;

-- S08. A price_drop SMS goes to an alert subscriber, not to one of the owner's own guests, so
-- its owner-readable delivery charge no longer carries the recipient number. check_in,
-- review_request and win_back (numbers the owner entered) keep the identical text.
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
  if v_row.automation_kind in ('check_in','review_request','win_back','price_drop') and v_row.charged_at is null then
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

REVOKE ALL ON FUNCTION public.sms_mark_provider_delivered(text, jsonb) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.sms_mark_provider_delivered(text, jsonb) TO service_role;

-- D7. Cancel / restore / update check ownership (no locks) before the global SMS claim lock,
-- raising the same error as before; for owners the lock sequence is unchanged (C20).
CREATE OR REPLACE FUNCTION public.cancel_manual_booking(p_id uuid)
 RETURNS manual_bookings
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_owner uuid := auth.uid();
  v_booking public.manual_bookings%rowtype;
begin
  if v_owner is null then
    raise exception 'ავტორიზაცია საჭიროა' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.manual_bookings
    where id = p_id and owner_id = v_owner
  ) then
    raise exception 'ჯავშანი ვერ მოიძებნა' using errcode = 'P0002';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('sms_dispatch_claim', 19002));
  select * into v_booking
  from public.manual_bookings
  where id = p_id and owner_id = v_owner
  for update;
  if not found then
    raise exception 'ჯავშანი ვერ მოიძებნა' using errcode = 'P0002';
  end if;
  if v_booking.status = 'cancelled' then
    return v_booking;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_booking.property_id::text, 0));

  -- A claimed/submitted row may already be at the provider boundary and is
  -- intentionally left untouched. Safe queued rows are retired; previously
  -- failed rows are detached too, so a later restore can enqueue a fresh
  -- message under the source uniqueness key.
  update public.sms_outbound s
  set status = 'failed',
      source_manual_booking_id = null,
      dispatch_claim_token = null,
      dispatch_claimed_at = null,
      provider_response = coalesce(s.provider_response, '{}'::jsonb)
        || jsonb_build_object(
          'cancelled', 'manual_booking_cancelled',
          'manual_booking_id', p_id
        )
  where s.source_manual_booking_id = p_id
    and s.charged_at is null
    and (
      s.status = 'failed'
      or (
        s.status = 'approved'
        and (s.dispatch_claimed_at is null
          or s.dispatch_claimed_at < now() - interval '15 minutes')
      )
    );

  delete from public.calendar_blocks where booking_id = p_id;
  update public.manual_bookings
  set status_before_cancel = case when status = 'booked' then 'booked' else 'manual' end,
      status = 'cancelled',
      cancelled_at = now(),
      cancelled_by = v_owner
  where id = p_id and owner_id = v_owner
  returning * into v_booking;
  return v_booking;
end;
$function$;

CREATE OR REPLACE FUNCTION public.restore_manual_booking(p_id uuid)
 RETURNS manual_bookings
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_owner uuid := auth.uid();
  v_booking public.manual_bookings%rowtype;
  v_conflict integer;
begin
  if v_owner is null then
    raise exception 'ავტორიზაცია საჭიროა' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.manual_bookings
    where id = p_id and owner_id = v_owner
  ) then
    raise exception 'ჯავშანი ვერ მოიძებნა' using errcode = 'P0002';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('sms_dispatch_claim', 19002));
  select * into v_booking
  from public.manual_bookings
  where id = p_id and owner_id = v_owner
  for update;
  if not found then
    raise exception 'ჯავშანი ვერ მოიძებნა' using errcode = 'P0002';
  end if;
  if v_booking.status <> 'cancelled' then
    return v_booking;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_booking.property_id::text, 0));
  select count(*) into v_conflict
  from public.calendar_blocks
  where property_id = v_booking.property_id
    and date between v_booking.check_in and v_booking.check_out
    and status in ('booked', 'blocked');
  if v_conflict > 0 then
    raise exception 'არჩეული თარიღები დაკავებულია' using errcode = '22023';
  end if;

  update public.manual_bookings
  set status = coalesce(status_before_cancel, 'manual'),
      cancelled_at = null,
      cancelled_by = null,
      status_before_cancel = null
  where id = p_id and owner_id = v_owner
  returning * into v_booking;

  insert into public.calendar_blocks (property_id, date, status, booking_id)
  select v_booking.property_id, d::date, 'booked', v_booking.id
  from generate_series(v_booking.check_in, v_booking.check_out, interval '1 day') d
  on conflict (property_id, date) do update
    set status = 'booked', booking_id = v_booking.id
    where public.calendar_blocks.status = 'available';
  return v_booking;
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
$function$;

REVOKE ALL ON FUNCTION public.cancel_manual_booking(uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.cancel_manual_booking(uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.restore_manual_booking(uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.restore_manual_booking(uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.update_manual_booking(uuid, date, date, text, text, text, integer, numeric, text, text, text, uuid, boolean, numeric, date) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.update_manual_booking(uuid, date, date, text, text, text, integer, numeric, text, text, text, uuid, boolean, numeric, date) TO authenticated, service_role;

-- anon has no manual_bookings policy and no legitimate write path (all writes go through
-- the definer RPCs above), so its table-level write grants are removed.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.manual_bookings FROM anon;

REVOKE TRUNCATE ON public.manual_bookings FROM authenticated;
