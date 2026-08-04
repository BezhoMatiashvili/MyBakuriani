-- Reversible cancellation and actor-aware history for renter calendar bookings.
-- Cancellation remains an UPDATE so the generic audit trigger records the actor.

alter table public.manual_bookings
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancelled_by uuid,
  add column if not exists status_before_cancel text;

-- Normalize any legacy cancelled rows before enforcing the complete state
-- shape. Older deployments allowed status='cancelled' without actor metadata.
update public.manual_bookings
set cancelled_at = coalesce(cancelled_at, created_at, now()),
    cancelled_by = coalesce(cancelled_by, owner_id),
    status_before_cancel = case
      when status_before_cancel in ('manual', 'booked') then status_before_cancel
      else 'manual'
    end
where status = 'cancelled';

update public.manual_bookings
set cancelled_at = null, cancelled_by = null, status_before_cancel = null
where status <> 'cancelled'
  and (cancelled_at is not null or cancelled_by is not null or status_before_cancel is not null);

alter table public.manual_bookings
  drop constraint if exists manual_bookings_cancellation_state_check;
alter table public.manual_bookings
  add constraint manual_bookings_cancellation_state_check check (
    (status = 'cancelled'
      and cancelled_at is not null
      and cancelled_by is not null
      and status_before_cancel in ('manual', 'booked'))
    or
    (status <> 'cancelled'
      and cancelled_at is null
      and cancelled_by is null
      and status_before_cancel is null)
  );

create index if not exists manual_bookings_cancelled_owner_property_idx
  on public.manual_bookings (owner_id, property_id, cancelled_at desc, id desc)
  where status = 'cancelled';

create index if not exists audit_logs_manual_booking_history_idx
  on public.audit_logs (subject_user_id, property_id, occurred_at desc, id desc)
  where table_name = 'manual_bookings';

-- The generic audit trigger stores only changed fields for UPDATEs. That is
-- useful for the admin log, but it is not an immutable booking-history
-- snapshot: after a later edit the UI could only fill missing guest/dates from
-- the current row and would therefore misrepresent an older cancellation.
-- Manual bookings keep complete before/after rows for every future event.
create or replace function public.audit_manual_booking_change()
returns trigger
language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  v_old jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  v_new jsonb := case when tg_op in ('UPDATE', 'INSERT') then to_jsonb(new) end;
  v_row jsonb := coalesce(v_new, v_old);
  v_changed text[];
  v_actor uuid;
  v_source text := 'system';
begin
  begin
    if tg_op = 'UPDATE' then
      select coalesce(array_agg(key), '{}') into v_changed
      from jsonb_object_keys(v_new) key
      where (v_old -> key) is distinct from (v_new -> key)
        and key <> 'updated_at';
      if coalesce(array_length(v_changed, 1), 0) = 0 then return null; end if;
    end if;

    v_actor := auth.uid();
    if v_actor is not null then
      v_source := 'user';
    else
      begin
        if (current_setting('request.jwt.claims', true)::jsonb ->> 'role') = 'service_role' then
          v_actor := ((current_setting('request.headers', true))::jsonb ->> 'x-actor-id')::uuid;
          if v_actor is not null then v_source := 'admin'; end if;
        end if;
      exception when others then
        v_actor := null;
        v_source := 'system';
      end;
    end if;

    insert into public.audit_logs (
      table_name, operation, record_id, actor_id, actor_source,
      subject_user_id, property_id, changed_fields, old_values, new_values
    ) values (
      'manual_bookings', tg_op, (v_row ->> 'id')::uuid,
      v_actor, v_source, (v_row ->> 'owner_id')::uuid,
      (v_row ->> 'property_id')::uuid, v_changed, v_old, v_new
    );
  exception when others then
    raise warning 'audit_manual_booking_change failed for % (%): %',
      coalesce(v_row ->> 'id', 'unknown'), tg_op, sqlerrm;
  end;
  return coalesce(new, old);
end;
$$;

revoke all on function public.audit_manual_booking_change() from public, anon, authenticated;
drop trigger if exists trg_audit_row on public.manual_bookings;
create trigger trg_audit_row
  after insert or update or delete on public.manual_bookings
  for each row execute function public.audit_manual_booking_change();

create or replace function public.cancel_manual_booking(p_id uuid)
returns public.manual_bookings
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_owner uuid := auth.uid();
  v_booking public.manual_bookings%rowtype;
begin
  if v_owner is null then
    raise exception 'ავტორიზაცია საჭიროა' using errcode = '42501';
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
$$;

create or replace function public.restore_manual_booking(p_id uuid)
returns public.manual_bookings
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_owner uuid := auth.uid();
  v_booking public.manual_bookings%rowtype;
  v_conflict integer;
begin
  if v_owner is null then
    raise exception 'ავტორიზაცია საჭიროა' using errcode = '42501';
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
$$;

-- Editing a cancelled row is an atomic restore-with-edits. This is the conflict
-- recovery path used when the original dates have since become unavailable.
create or replace function public.update_manual_booking(
  p_id uuid, p_check_in date, p_check_out date,
  p_source text default null, p_guest_name text default null,
  p_guest_phone text default null, p_guests_count int default null,
  p_amount numeric default null, p_note text default null,
  p_status text default 'manual', p_client_list text default null,
  p_renter_guest_id uuid default null,
  p_marketing_consent boolean default null
) returns public.manual_bookings
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_owner uuid := auth.uid();
  v_existing public.manual_bookings%rowtype;
  v_row public.manual_bookings%rowtype;
  v_guest_id uuid;
  v_conflict integer;
  v_consent boolean;
begin
  if v_owner is null then raise exception 'ავტორიზაცია საჭიროა' using errcode = '42501'; end if;
  if p_check_out < p_check_in then raise exception 'არასწორი თარიღები' using errcode = '22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended('sms_dispatch_claim', 19002));
  select * into v_existing from public.manual_bookings
  where id = p_id and owner_id = v_owner for update;
  if not found then raise exception 'ჯავშანი ვერ მოიძებნა' using errcode = 'P0002'; end if;

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

  v_consent := coalesce(p_marketing_consent, v_existing.marketing_consent, false);
  update public.sms_outbound s
  set status = 'failed', dispatch_claim_token = null, dispatch_claimed_at = null,
      provider_response = coalesce(s.provider_response, '{}'::jsonb)
        || jsonb_build_object('cancelled', 'manual_booking_changed')
  where s.source_manual_booking_id = p_id and s.status = 'approved'
    and s.charged_at is null
    and (s.dispatch_claimed_at is null or s.dispatch_claimed_at < now() - interval '15 minutes');

  delete from public.calendar_blocks where booking_id = p_id;
  update public.manual_bookings set
    check_in = p_check_in, check_out = p_check_out, source = p_source,
    guest_name = nullif(btrim(p_guest_name), ''), guest_phone = nullif(btrim(p_guest_phone), ''),
    guests_count = p_guests_count, amount = p_amount, note = p_note,
    status = case when p_status = 'booked' then 'booked' else 'manual' end,
    status_before_cancel = null, cancelled_at = null, cancelled_by = null,
    client_list = p_client_list, renter_guest_id = v_guest_id,
    marketing_consent = v_consent,
    marketing_consent_at = case when v_consent then coalesce(v_existing.marketing_consent_at, now()) else null end
  where id = p_id and owner_id = v_owner returning * into v_row;

  insert into public.calendar_blocks (property_id, date, status, booking_id)
  select v_existing.property_id, d::date, 'booked', p_id
  from generate_series(p_check_in, p_check_out, interval '1 day') d
  on conflict (property_id, date) do update set status = 'booked', booking_id = p_id
    where public.calendar_blocks.status = 'available';
  return v_row;
end;
$$;

-- Cancelled stays cannot mint, reveal, or consume a review token. Restoring the
-- same row makes an unexpired token eligible again.
create or replace function public.sms_create_manual_review_token(p_owner_id uuid, p_manual_booking_id uuid)
returns text language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare v_token text;
begin
  if not exists(select 1 from public.manual_bookings mb join public.properties p on p.id=mb.property_id
    where mb.id=p_manual_booking_id and mb.owner_id=p_owner_id and mb.status<>'cancelled'
      and mb.marketing_consent and mb.check_out<=(now() at time zone 'Asia/Tbilisi')::date
      and coalesce(p.is_for_sale,false)=false)
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
    and mb.status<>'cancelled'
    and not exists(select 1 from public.reviews r where r.manual_booking_id=mb.id);
$$;

create or replace function public.submit_manual_booking_review(p_token text,p_rating numeric,p_comment text default null)
returns uuid language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare v_token public.manual_booking_review_tokens%rowtype; v_booking public.manual_bookings%rowtype; v_id uuid;
begin
  if p_rating<1 or p_rating>5 then raise exception 'rating must be between 1 and 5' using errcode='22023'; end if;
  select * into v_token from public.manual_booking_review_tokens where token_hash=digest(p_token,'sha256') for update;
  if not found or v_token.used_at is not null or v_token.expires_at<=now() then raise exception 'invalid or expired token' using errcode='22023'; end if;
  select * into v_booking from public.manual_bookings where id=v_token.manual_booking_id and status<>'cancelled';
  if not found then raise exception 'invalid or expired token' using errcode='22023'; end if;
  insert into public.reviews(property_id,booking_id,manual_booking_id,guest_id,guest_name_snapshot,rating,comment)
  values(v_booking.property_id,null,v_booking.id,null,nullif(btrim(v_booking.guest_name),''),p_rating,nullif(btrim(p_comment),'')) returning id into v_id;
  update public.manual_booking_review_tokens set used_at=now() where manual_booking_id=v_booking.id;
  return v_id;
end;
$$;

-- Keep the dispatch-time revalidation aligned with the edge scanner: a
-- cancelled later stay is not a re-booking and must not suppress win-back.
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
                and not exists(select 1 from public.bookings later where later.owner_id=b.owner_id and later.guest_id=b.guest_id and later.status<>'cancelled' and later.check_in>b.check_out))
            )
        )
        or exists(
          select 1 from public.manual_bookings mb join public.properties p on p.id=mb.property_id
          where mb.id=s.source_manual_booking_id and mb.owner_id=s.sender_id and mb.status<>'cancelled'
            and coalesce(p.is_for_sale,false)=false
            and public.sms_canonical_ge_phone(mb.guest_phone)=public.sms_canonical_ge_phone(s.recipient_phone)
            and (
              (s.automation_kind='check_in' and mb.check_in=(now() at time zone 'Asia/Tbilisi')::date+1)
              or (s.automation_kind='review_request' and mb.marketing_consent
                and mb.check_out=(now() at time zone 'Asia/Tbilisi')::date-1
                and not exists(select 1 from public.reviews rv where rv.manual_booking_id=mb.id)
                and not exists(select 1 from public.profiles po where po.marketing_opt_out and public.sms_canonical_ge_phone(po.phone)=public.sms_canonical_ge_phone(mb.guest_phone)))
              or (s.automation_kind='win_back' and mb.marketing_consent
                and mb.check_out=(now() at time zone 'Asia/Tbilisi')::date-90
                and not exists(select 1 from public.profiles po where po.marketing_opt_out and public.sms_canonical_ge_phone(po.phone)=public.sms_canonical_ge_phone(mb.guest_phone))
                and not exists(select 1 from public.manual_bookings later where later.owner_id=mb.owner_id and later.status<>'cancelled' and public.sms_canonical_ge_phone(later.guest_phone)=public.sms_canonical_ge_phone(mb.guest_phone) and later.check_in>mb.check_out))
            )
        )
      )
    );
  get diagnostics v_n=row_count; return v_n;
end;
$$;

revoke all on function public.cancel_manual_booking(uuid) from public, anon;
revoke all on function public.restore_manual_booking(uuid) from public, anon;
grant execute on function public.cancel_manual_booking(uuid) to authenticated;
grant execute on function public.restore_manual_booking(uuid) to authenticated;

revoke all on function public.update_manual_booking(uuid,date,date,text,text,text,int,numeric,text,text,text,uuid,boolean) from public;
grant execute on function public.update_manual_booking(uuid,date,date,text,text,text,int,numeric,text,text,text,uuid,boolean) to authenticated;

revoke all on function public.sms_create_manual_review_token(uuid,uuid) from public,anon,authenticated;
revoke all on function public.manual_review_token_details(text) from public,anon,authenticated;
revoke all on function public.submit_manual_booking_review(text,numeric,text) from public,anon,authenticated;
grant execute on function public.sms_create_manual_review_token(uuid,uuid) to service_role;
grant execute on function public.manual_review_token_details(text) to service_role;
grant execute on function public.submit_manual_booking_review(text,numeric,text) to service_role;
revoke all on function public.sms_cancel_ineligible_automation() from public,anon,authenticated;
grant execute on function public.sms_cancel_ineligible_automation() to service_role;

notify pgrst, 'reload schema';
