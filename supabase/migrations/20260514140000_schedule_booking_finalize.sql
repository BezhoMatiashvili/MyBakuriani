-- Daily cron job that auto-completes bookings past check_out and
-- notifies guests with an in-dashboard rating link.
--
-- Prerequisites (run once in the Supabase dashboard or via psql before
-- applying this migration in production):
--
--   1. Enable extensions:
--        CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
--        CREATE EXTENSION IF NOT EXISTS pg_net  WITH SCHEMA extensions;
--
--   2. Store the edge-function URL and shared secret as Postgres settings
--      (so we never commit them to source control). Run via the SQL editor:
--
--        ALTER DATABASE postgres SET app.booking_finalize_url =
--          'https://<project-ref>.supabase.co/functions/v1/booking-finalize';
--        ALTER DATABASE postgres SET app.booking_finalize_secret =
--          '<paste-random-secret-here>';
--
--      The same secret must be set on the edge function as
--      BOOKING_FINALIZE_SECRET via `supabase secrets set`.
--
-- If pg_cron isn't enabled on your plan, schedule the same HTTP call via
-- Vercel Cron (vercel.json) hitting the edge function URL with the
-- bearer secret. In that case skip this migration.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_extension WHERE extname = 'pg_cron'
  ) AND EXISTS (
    SELECT 1 FROM pg_extension WHERE extname = 'pg_net'
  ) THEN
    -- Remove any previous schedule with the same name (idempotent re-run).
    PERFORM cron.unschedule(jobid)
    FROM cron.job
    WHERE jobname = 'booking-finalize-daily';

    PERFORM cron.schedule(
      'booking-finalize-daily',
      '0 6 * * *',
      $cron$
      SELECT net.http_post(
        url := current_setting('app.booking_finalize_url', true),
        headers := jsonb_build_object(
          'Authorization',
          'Bearer ' || current_setting('app.booking_finalize_secret', true),
          'Content-Type', 'application/json'
        ),
        body := '{}'::jsonb
      );
      $cron$
    );
  ELSE
    RAISE NOTICE
      'pg_cron / pg_net not installed — booking-finalize will not run automatically. '
      'Enable both extensions or use Vercel Cron instead.';
  END IF;
END $$;
