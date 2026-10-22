-- Guest SMS consent follows the number, per host (2026-10-22).
--
-- manual_booking_sms_consents holds one row per booking, so a guest who had
-- already accepted for a host's earlier booking was asked again on every new
-- booking: the panel showed "SMS not sent yet" with a send button, and the
-- 24-hour per-number cap could refuse the second text. A host + canonical
-- number now has one standing answer:
-- - a booking that appears, or gets this number, while an acceptance stands
--   starts accepted (row 'manual-sms-v2-inherited', status 'accepted', and the
--   booking's marketing_consent set), with no new SMS;
-- - the guest's acceptance also covers the host's other open bookings for the
--   number that have no answer on record yet;
-- - the guest's decline or revoke on any of that host's bookings withdraws
--   every accepted row of the host and number, clears their flag and fails
--   their queued review/win-back SMS.
-- An inherited row carries a random hash nobody holds (the accepted state needs
-- one), so no link can answer it, and the cancel / phone-change / reissue paths
-- that revoke "rows with a token_hash" still reach it.
--
-- The review and win-back texts carry no opt-out of their own: the consent link
-- is the guest's only way to withdraw. So a standing acceptance must always keep
-- at least one row the guest can still answer (accepted, link-issued, on a live
-- booking that still carries the number). Inherited rows never count as that
-- source, and when the last one goes (its booking is cancelled, loses the number
-- or is deleted) the host's inherited rows for the number are withdrawn: revoked
-- WITHOUT accepted_at, so the booking is not read as the guest's own withdrawal
-- and the host can ask again.
--
-- Redefined: respond_manual_booking_sms_consent (its live body, only the two
-- marked blocks are new).
--
-- Refuses (55000) when the live body of that function differs from the reviewed
-- one, and while a host's number holds an acceptance with a LATER decline or
-- revoke on another live booking (rows written before this release kept those
-- apart; a project holding one is settled by hand first).

DO $guard$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT v.fn, v.expected,
           (SELECT md5(p.prosrc) FROM pg_proc p WHERE p.oid = to_regprocedure(v.fn)) AS live
    FROM (VALUES
      ('public.respond_manual_booking_sms_consent(text,text)', '20b72cfee4120f39ad035e27b44a5062')
    ) AS v(fn, expected)
  LOOP
    IF r.live IS DISTINCT FROM r.expected THEN
      RAISE EXCEPTION 'sms-consent-same-host: % differs from the reviewed body (md5 %); regenerate this migration from the live definition', r.fn, r.live
        USING ERRCODE = '55000';
    END IF;
  END LOOP;

  IF EXISTS (
    SELECT 1
    FROM public.manual_booking_sms_consents c
    WHERE c.status = 'accepted'
      AND c.consent_version IS DISTINCT FROM 'manual-sms-v1'
      AND EXISTS (
        SELECT 1
        FROM public.manual_booking_sms_consents d
        JOIN public.manual_bookings db ON db.id = d.manual_booking_id
        WHERE d.owner_id = c.owner_id
          AND d.phone_snapshot = c.phone_snapshot
          AND d.id <> c.id
          AND d.consent_version IS DISTINCT FROM 'manual-sms-v1'
          AND (
            d.declined_at > c.accepted_at
            OR (d.status = 'revoked' AND d.accepted_at IS NOT NULL AND d.revoked_at > c.accepted_at
                AND db.status <> 'cancelled'
                AND public.sms_canonical_ge_phone(db.guest_phone) = d.phone_snapshot)
          )
      )
  ) THEN
    RAISE EXCEPTION 'a host number holds an acceptance with a later decline or revoke on another booking; settle it first'
      USING ERRCODE = '55000';
  END IF;
END
$guard$;

-- The one definition of "this host's number has a standing acceptance": an
-- accepted row the guest can answer (not v1, not inherited) on another live
-- booking of the host that still carries the number, with no later decline of
-- that number. Gives the booking an inherited accepted row and its flag; false
-- when it already holds a link or answer for the number, is cancelled, has no
-- valid number, or nothing stands.
CREATE OR REPLACE FUNCTION public.manual_sms_consent_inherit(p_owner_id uuid, p_booking_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_booking public.manual_bookings%rowtype;
  v_phone text;
  v_accepted_at timestamptz;
  v_prev text;
begin
  -- Same lock as respond / cancel / update: a guest's withdrawal and this grant
  -- are serialized, so a grant never lands after the revoke it should obey.
  perform pg_advisory_xact_lock(hashtextextended('sms_dispatch_claim', 19002));

  select * into v_booking from public.manual_bookings
  where id = p_booking_id and owner_id = p_owner_id and status <> 'cancelled';
  if not found then return false; end if;
  v_phone := public.sms_canonical_ge_phone(v_booking.guest_phone);
  if v_phone is null then return false; end if;

  if exists (
    select 1 from public.manual_booking_sms_consents c
    where c.manual_booking_id = v_booking.id and c.phone_snapshot = v_phone
  ) then
    return false;
  end if;

  select c.accepted_at into v_accepted_at
  from public.manual_booking_sms_consents c
  join public.manual_bookings b on b.id = c.manual_booking_id
  where c.owner_id = p_owner_id
    and c.phone_snapshot = v_phone
    and c.status = 'accepted'
    and c.consent_version not in ('manual-sms-v1', 'manual-sms-v2-inherited')
    and b.owner_id = p_owner_id
    and b.id <> v_booking.id
    and b.status <> 'cancelled'
    and public.sms_canonical_ge_phone(b.guest_phone) = v_phone
    and not exists (
      select 1 from public.manual_booking_sms_consents d
      where d.owner_id = c.owner_id
        and d.phone_snapshot = c.phone_snapshot
        and d.declined_at > c.accepted_at
    )
  order by c.accepted_at desc
  limit 1;
  if v_accepted_at is null then return false; end if;

  insert into public.manual_booking_sms_consents (
    manual_booking_id, owner_id, token_hash, phone_snapshot, consent_version, status, accepted_at
  ) values (
    v_booking.id, p_owner_id,
    encode(sha256(convert_to(gen_random_uuid()::text || gen_random_uuid()::text, 'UTF8')), 'hex'),
    v_phone, 'manual-sms-v2-inherited', 'accepted', v_accepted_at
  );

  v_prev := current_setting('app.manual_booking_sms_consent_write', true);
  perform set_config('app.manual_booking_sms_consent_write', 'allowed', true);
  update public.manual_bookings
  set marketing_consent = true, marketing_consent_at = v_accepted_at
  where id = v_booking.id;
  perform set_config('app.manual_booking_sms_consent_write', coalesce(v_prev, ''), true);
  return true;
end;
$function$;

-- A guest's yes covers the host's other bookings for the number that are still
-- open (check-out today or later, Tbilisi) and have no answer on record: a
-- booking that already ended is left alone so no stay from the past starts
-- queueing review or win-back texts.
CREATE OR REPLACE FUNCTION public.manual_sms_consent_cover(p_owner_id uuid, p_phone text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  r record;
  v_n integer := 0;
begin
  for r in
    select mb.id from public.manual_bookings mb
    where mb.owner_id = p_owner_id
      and mb.status <> 'cancelled'
      and mb.check_out >= (now() at time zone 'Asia/Tbilisi')::date
      and public.sms_canonical_ge_phone(mb.guest_phone) = p_phone
    order by mb.created_at, mb.id
  loop
    if public.manual_sms_consent_inherit(p_owner_id, r.id) then
      v_n := v_n + 1;
    end if;
  end loop;
  return v_n;
end;
$function$;

-- The other half of the invariant: when no row the guest can answer is left for
-- the host's number, the inherited rows for it go (see the header). Not best
-- effort: a withdrawal must not fail silently.
CREATE OR REPLACE FUNCTION public.manual_sms_consent_reconcile(p_owner_id uuid, p_phone text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_withdrawn uuid[];
  v_prev text;
begin
  if p_phone is null then return 0; end if;
  perform pg_advisory_xact_lock(hashtextextended('sms_dispatch_claim', 19002));

  if exists (
    select 1
    from public.manual_booking_sms_consents c
    join public.manual_bookings b on b.id = c.manual_booking_id
    where c.owner_id = p_owner_id
      and c.phone_snapshot = p_phone
      and c.status = 'accepted'
      and c.consent_version not in ('manual-sms-v1', 'manual-sms-v2-inherited')
      and b.owner_id = p_owner_id
      and b.status <> 'cancelled'
      and public.sms_canonical_ge_phone(b.guest_phone) = p_phone
  ) then
    return 0;
  end if;

  with withdrawn as (
    update public.manual_booking_sms_consents c
    set status = 'revoked', revoked_at = now(), accepted_at = null
    where c.owner_id = p_owner_id
      and c.phone_snapshot = p_phone
      and c.status = 'accepted'
      and c.consent_version = 'manual-sms-v2-inherited'
    returning c.manual_booking_id
  )
  select coalesce(array_agg(w.manual_booking_id), '{}'::uuid[]) into v_withdrawn from withdrawn w;
  if cardinality(v_withdrawn) = 0 then return 0; end if;

  v_prev := current_setting('app.manual_booking_sms_consent_write', true);
  perform set_config('app.manual_booking_sms_consent_write', 'allowed', true);
  update public.manual_bookings
  set marketing_consent = false, marketing_consent_at = null
  where id = any(v_withdrawn);
  perform set_config('app.manual_booking_sms_consent_write', coalesce(v_prev, ''), true);

  update public.sms_outbound s
  set status = 'failed',
      dispatch_claim_token = null,
      dispatch_claimed_at = null,
      provider_response = coalesce(s.provider_response, '{}'::jsonb)
        || jsonb_build_object('cancelled', 'guest_sms_consent_source_gone')
  where s.source_manual_booking_id = any(v_withdrawn)
    and s.automation_kind in ('review_request', 'win_back')
    and s.status = 'approved'
    and s.charged_at is null
    and (s.dispatch_claimed_at is null
      or s.dispatch_claimed_at < now() - interval '15 minutes');
  return cardinality(v_withdrawn);
end;
$function$;

-- A booking that appears or gets a number may inherit (best effort: a failure
-- leaves it as it was before this release, with no consent on record and the
-- host free to ask); a booking that loses its number, is cancelled or deleted
-- may have been the last link the guest could answer.
CREATE OR REPLACE FUNCTION public.manual_booking_sms_consent_follow_trg()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if tg_op in ('UPDATE', 'DELETE') then
    perform public.manual_sms_consent_reconcile(old.owner_id, public.sms_canonical_ge_phone(old.guest_phone));
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    begin
      perform public.manual_sms_consent_inherit(new.owner_id, new.id);
    exception when others then
      raise warning 'manual_booking_sms_consent_inherit failed for %: % (%)', new.id, sqlerrm, sqlstate;
    end;
  end if;
  return null;
end;
$function$;

revoke all on function public.manual_sms_consent_inherit(uuid, uuid) from public, anon, authenticated;
revoke all on function public.manual_sms_consent_cover(uuid, text) from public, anon, authenticated;
revoke all on function public.manual_sms_consent_reconcile(uuid, text) from public, anon, authenticated;
revoke all on function public.manual_booking_sms_consent_follow_trg() from public, anon, authenticated;

drop trigger if exists manual_booking_sms_consent_follow_ins on public.manual_bookings;
create trigger manual_booking_sms_consent_follow_ins
  after insert on public.manual_bookings
  for each row
  when (new.guest_phone is not null and new.status <> 'cancelled')
  execute function public.manual_booking_sms_consent_follow_trg();

drop trigger if exists manual_booking_sms_consent_follow_upd on public.manual_bookings;
create trigger manual_booking_sms_consent_follow_upd
  after update of guest_phone, status on public.manual_bookings
  for each row
  when (
    public.sms_canonical_ge_phone(new.guest_phone)
      is distinct from public.sms_canonical_ge_phone(old.guest_phone)
    or (new.status = 'cancelled' and old.status <> 'cancelled')
  )
  execute function public.manual_booking_sms_consent_follow_trg();

drop trigger if exists manual_booking_sms_consent_follow_del on public.manual_bookings;
create trigger manual_booking_sms_consent_follow_del
  after delete on public.manual_bookings
  for each row
  execute function public.manual_booking_sms_consent_follow_trg();

CREATE OR REPLACE FUNCTION public.respond_manual_booking_sms_consent(p_token_hash text, p_action text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_consent public.manual_booking_sms_consents%rowtype;
  v_booking public.manual_bookings%rowtype;
  v_status text;
  v_withdrawn uuid[];
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
    -- same-host consent (20261022150000): the yes also covers the host's other open bookings for this number
    perform public.manual_sms_consent_cover(v_consent.owner_id, v_consent.phone_snapshot);
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

    -- same-host consent (20261022150000): the answer is the guest's for the number, so it withdraws every other accepted row of this host
    with withdrawn as (
      update public.manual_booking_sms_consents c
      set status = 'revoked', revoked_at = now()
      where c.owner_id = v_consent.owner_id
        and c.phone_snapshot = v_consent.phone_snapshot
        and c.status = 'accepted'
        and c.id <> v_consent.id
      returning c.manual_booking_id
    )
    select coalesce(array_agg(w.manual_booking_id), '{}'::uuid[]) into v_withdrawn from withdrawn w;
    update public.manual_bookings
    set marketing_consent = false, marketing_consent_at = null
    where id = any(v_withdrawn);
    update public.sms_outbound s
    set status = 'failed',
        dispatch_claim_token = null,
        dispatch_claimed_at = null,
        provider_response = coalesce(s.provider_response, '{}'::jsonb)
          || jsonb_build_object('cancelled', 'guest_sms_consent_' || p_action)
    where s.source_manual_booking_id = any(v_withdrawn)
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
$function$;

-- Hosts that already hold an acceptance: their open bookings for that number
-- start accepted too (the booking a host just added is typically one of them).
DO $backfill$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT DISTINCT c.owner_id, c.phone_snapshot
    FROM public.manual_booking_sms_consents c
    WHERE c.status = 'accepted'
      AND c.consent_version NOT IN ('manual-sms-v1', 'manual-sms-v2-inherited')
  LOOP
    PERFORM public.manual_sms_consent_cover(r.owner_id, r.phone_snapshot);
  END LOOP;
END
$backfill$;
