-- assign_notification_dashboard_scope was created by 20260727130000 without the
-- REVOKE that 20260626123000_revoke_execute_trigger_functions.sql applies to every
-- other trigger function, so it shipped with the default PUBLIC EXECUTE grant and
-- was reachable at /rest/v1/rpc/ by anon and authenticated.
--
-- Calling a trigger function directly raises 0A000 ("trigger functions can only be
-- called as triggers"), so the exposure is not itself exploitable — but it is the
-- only trigger function in the schema still holding that grant, and it trips the
-- anon/authenticated_security_definer_function_executable advisors. Bring it back
-- in line with the established convention.
REVOKE ALL ON FUNCTION public.assign_notification_dashboard_scope()
  FROM PUBLIC, anon, authenticated;
