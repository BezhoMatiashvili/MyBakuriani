-- Discovered 2026-09-05 while syncing the newly-created staging project's DB to
-- match prod: pg_dump/restore-based cloning (see the staging-environment-live
-- memory note) does not faithfully replicate table-level GRANT/REVOKE state, the
-- same class of gap already known for function EXECUTE grants (see the
-- fix-function-grants reconciliation from staging's original creation). A fresh
-- Supabase project's tables auto-inherit full anon/authenticated privileges via
-- the platform's own default ACLs; the many security-hardening migrations that
-- later revoked specific privileges on prod (profiles PII columns, audit_logs,
-- job_applications, manual_bookings, and the fully-closed admin-notes/backup/
-- rate-limit/token tables) are not "seen" by a schema-only dump/restore the same
-- way DDL is.
--
-- This is a no-op against prod (already in this state) and exists so a future
-- clone/rebuild converges to the same safe state without rediscovering the gap.
REVOKE DELETE, INSERT, UPDATE ON public.audit_logs FROM anon, authenticated;
REVOKE ALL ON public.contact_reveal_events FROM anon, authenticated;
REVOKE DELETE, INSERT, UPDATE ON public.job_applications FROM anon, authenticated;
REVOKE ALL ON public.listing_view_events FROM anon, authenticated;
REVOKE ALL ON public.manual_booking_review_tokens FROM anon, authenticated;
REVOKE ALL ON public.manual_booking_sms_consents FROM anon, authenticated;
REVOKE DELETE, INSERT, UPDATE ON public.manual_bookings FROM authenticated;
REVOKE ALL ON public.media_upload_intents FROM anon, authenticated;
REVOKE ALL ON public.organization_admin_notes FROM anon, authenticated;
REVOKE ALL ON public.page_views FROM anon, authenticated;
REVOKE ALL ON public.profile_admin_notes FROM anon, authenticated;
REVOKE SELECT ON public.profiles FROM anon;
REVOKE ALL ON public.properties_photos_backup FROM anon, authenticated;
REVOKE ALL ON public.property_admin_notes FROM anon, authenticated;
REVOKE ALL ON public.rate_limit_counters FROM anon, authenticated;
REVOKE ALL ON public.sale_price_alert_rules FROM anon, authenticated;
REVOKE DELETE, INSERT, REFERENCES, TRIGGER, TRUNCATE, UPDATE ON public.sale_price_alert_subscriptions FROM authenticated;
REVOKE ALL ON public.sale_price_alert_subscriptions FROM anon;
REVOKE ALL ON public.sale_price_drop_events FROM anon, authenticated;
REVOKE ALL ON public.service_admin_notes FROM anon, authenticated;
REVOKE ALL ON public.services_photos_backup FROM anon, authenticated;

-- Column-level SELECT for anon on profiles, matching C25's presentation-safe
-- subset exactly (never phone/personal_id/role).
GRANT SELECT (id, display_name, avatar_url, is_verified, bio, rating, response_time_minutes, verified_at, created_at, updated_at, profile_type)
  ON public.profiles TO anon;
