-- Lock down money/booking RPCs that were left directly callable by anon /
-- authenticated via PostgREST.
--
-- Supabase's default privileges GRANT EXECUTE to anon + authenticated on every
-- new public function. The original definitions (012_atomic_money_operations.sql)
-- only `REVOKE ... FROM PUBLIC`, which does NOT remove those role-specific grants
-- — so a logged-in user could POST /rest/v1/rpc/<fn> directly and bypass the
-- service-role edge functions (e.g. credit their own wallet via topup_balance
-- without paying). purchase_vip / purchase_package were already correctly locked;
-- this brings the rest in line. All legitimate callers use the service role, so
-- revoking the direct grants is safe.

REVOKE ALL ON FUNCTION public.topup_balance(UUID, NUMERIC, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.topup_balance(UUID, NUMERIC, TEXT) TO service_role;

REVOKE ALL ON FUNCTION public.create_booking(UUID, UUID, DATE, DATE, INT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_booking(UUID, UUID, DATE, DATE, INT, TEXT) TO service_role;

REVOKE ALL ON FUNCTION public.release_booking_calendar(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_booking_calendar(UUID) TO service_role;
