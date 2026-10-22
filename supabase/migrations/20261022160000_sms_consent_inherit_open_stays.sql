-- Guest SMS consent follows the number: only open stays inherit (follow-up to
-- 20261022150000, 2026-10-22).
--
-- manual_sms_consent_cover has always skipped bookings that already ended ("no
-- stay from the past starts queueing review or win-back texts"), but the
-- manual_bookings triggers (insert, number or status change) call
-- manual_sms_consent_inherit directly and it had no such gate. A host who
-- entered a past-dated booking for a returning number therefore got an
-- inherited acceptance and marketing flag on a stay that was already over.
--
-- The gate moves into inherit itself (check-out today or later, Tbilisi, the
-- rule cover and the backfill already use), so the triggers, cover and the
-- backfill share one definition. Nothing else changes: the body is the one from
-- 20261022150000 plus the three-line gate after the booking is read.
--
-- Refuses (55000) when the live body of inherit differs from the reviewed one
-- (20261022150000's). No data change: no inherited row exists on an ended stay
-- (checked on staging and prod before this was written), and a booking that
-- already holds an inherited row keeps it (reconcile still withdraws it).

DO $guard$
DECLARE
  v_live text;
BEGIN
  SELECT md5(p.prosrc) INTO v_live
  FROM pg_proc p
  WHERE p.oid = to_regprocedure('public.manual_sms_consent_inherit(uuid,uuid)');
  IF v_live IS DISTINCT FROM '262aa0f27f72b492ad4245f2f1ea0b3e' THEN
    RAISE EXCEPTION 'sms-consent-inherit-open-stays: manual_sms_consent_inherit differs from the reviewed body (md5 %); regenerate this migration from the live definition', v_live
      USING ERRCODE = '55000';
  END IF;
END
$guard$;

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

  -- Open stays only (check-out today or later, Tbilisi). Every caller shares
  -- this gate: the manual_bookings triggers, cover and the backfill, so no stay
  -- from the past starts queueing review or win-back texts.
  if v_booking.check_out < (now() at time zone 'Asia/Tbilisi')::date then return false; end if;
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

-- CREATE OR REPLACE keeps the grants; stated again so the file stands alone.
revoke all on function public.manual_sms_consent_inherit(uuid, uuid) from public, anon, authenticated;
