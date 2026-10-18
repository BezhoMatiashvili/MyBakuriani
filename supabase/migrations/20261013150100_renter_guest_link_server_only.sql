-- renter_guests: profile_id is resolved by phone for server code only (2026-10-13).
--
-- The SECURITY DEFINER trigger read every profiles.phone and wrote the matching
-- account id into the caller's own guest row, which the caller reads back: a plain
-- INSERT/UPDATE, add_renter_guest_to_blacklist and create_guest_manual_booking all
-- turned any phone number into "registered? which account id?" past profiles RLS
-- (C25). profile_id is read only to map platform bookings to contacts (renter guests
-- and calendar pages), and those links come from ensure_renter_guest's explicit id
-- (sync_platform_booking_guest), which is unchanged. Service role, pg_cron and
-- migrations (auth.role() 'service_role' or NULL) still resolve by phone.
--
-- Body = the live staging definition plus the role test; the guard refuses
-- (55000) where the live body differs.

do $guard$
declare
  r record;
begin
  for r in
    select v.fn, v.expected,
           (select md5(p.prosrc) from pg_proc p where p.oid = to_regprocedure(v.fn)) as live
    from (values
      ('public.renter_guests_resolve_profile()', '0b36f18cb2ce00ba2359d51fec0d0d93')
    ) as v(fn, expected)
  loop
    if r.live is distinct from r.expected then
      raise exception 'renter_guest_link_server_only: % differs from the reviewed body (md5 %); regenerate this migration from the live definition', r.fn, r.live
        using errcode = '55000';
    end if;
  end loop;
end
$guard$;

CREATE OR REPLACE FUNCTION public.renter_guests_resolve_profile()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Only server code (service role, cron, migrations) links a contact to an
  -- account by phone. From a browser session, a DEFINER RPC included, the
  -- lookup would tell any signed-in user which account owns a phone number.
  IF NEW.profile_id IS NULL AND normalize_ge_phone(NEW.phone) IS NOT NULL
     AND (auth.role() IS NULL OR auth.role() = 'service_role') THEN
    SELECT id INTO NEW.profile_id
    FROM profiles
    WHERE normalize_ge_phone(phone) = normalize_ge_phone(NEW.phone)
    LIMIT 1;
  END IF;
  RETURN NEW;
END;
$function$;
