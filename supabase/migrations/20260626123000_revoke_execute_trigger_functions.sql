-- Security: trigger functions are invoked by the trigger mechanism under their
-- definer's privileges; clients never call them directly, so they don't need an
-- EXECUTE grant. Revoke EXECUTE from PUBLIC/anon/authenticated on every
-- SECURITY DEFINER trigger function in public. Clears the
-- `{anon,authenticated}_security_definer_function_executable` advisors for these.
--
-- Intentionally NOT touched (must keep EXECUTE):
--   - client RPCs: global_search, create_booking, create_manual_booking,
--     record_contact_event, increment_views, increment_service_menu_views,
--     get_platform_cleaners, owner_dashboard_stats, sms_audience_count, sms_consume_credit
--   - is_admin_user(): evaluated inside RLS policies as the calling role, so
--     authenticated MUST retain EXECUTE or every admin policy breaks.
--
-- Generic + idempotent + future-proof: it targets all SECURITY DEFINER trigger
-- functions, so new ones are covered on re-run.

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef
      AND p.prorettype = 'pg_catalog.trigger'::regtype
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.sig);
  END LOOP;
END $$;
