-- Cron schedules for the two new background jobs:
--   * vip-lifecycle  — daily VIP expiry warnings (48h) + auto-clear of lapsed flags
--   * sms-dispatch    — frequent drain of approved sms_outbound rows to the provider
--
-- Prerequisites (run ONCE in the Supabase dashboard / SQL editor before this
-- runs in production — same pattern as 20260514140000_schedule_booking_finalize):
--
--   1. Enable extensions:
--        CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
--        CREATE EXTENSION IF NOT EXISTS pg_net  WITH SCHEMA extensions;
--
--   2. Store edge-function URLs + shared secrets as Postgres settings:
--        ALTER DATABASE postgres SET app.vip_lifecycle_url =
--          'https://<project-ref>.supabase.co/functions/v1/vip-lifecycle';
--        ALTER DATABASE postgres SET app.vip_lifecycle_secret = '<random-secret>';
--        ALTER DATABASE postgres SET app.sms_dispatch_url =
--          'https://<project-ref>.supabase.co/functions/v1/sms-dispatch';
--        ALTER DATABASE postgres SET app.sms_dispatch_secret = '<random-secret>';
--
--   3. Set the matching edge-function secrets (and, when a provider is chosen,
--      the provider key) via `supabase secrets set`:
--        VIP_LIFECYCLE_SECRET=<same as app.vip_lifecycle_secret>
--        SMS_DISPATCH_SECRET=<same as app.sms_dispatch_secret>
--        SMS_PROVIDER_API_KEY=<provider key>   # until set, sms-dispatch is inert
--
-- If pg_cron isn't available on your plan, schedule the same HTTP calls via
-- Vercel Cron hitting the function URLs with the Bearer secret, and skip this.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_extension WHERE extname = 'pg_cron'
  ) AND EXISTS (
    SELECT 1 FROM pg_extension WHERE extname = 'pg_net'
  ) THEN
    -- vip-lifecycle: once a day at 06:30 UTC.
    PERFORM cron.unschedule(jobid)
    FROM cron.job
    WHERE jobname = 'vip-lifecycle-daily';

    PERFORM cron.schedule(
      'vip-lifecycle-daily',
      '30 6 * * *',
      $cron$
      SELECT net.http_post(
        url := current_setting('app.vip_lifecycle_url', true),
        headers := jsonb_build_object(
          'Authorization',
          'Bearer ' || current_setting('app.vip_lifecycle_secret', true),
          'Content-Type', 'application/json'
        ),
        body := '{}'::jsonb
      );
      $cron$
    );

    -- sms-dispatch: every 10 minutes.
    PERFORM cron.unschedule(jobid)
    FROM cron.job
    WHERE jobname = 'sms-dispatch-frequent';

    PERFORM cron.schedule(
      'sms-dispatch-frequent',
      '*/10 * * * *',
      $cron$
      SELECT net.http_post(
        url := current_setting('app.sms_dispatch_url', true),
        headers := jsonb_build_object(
          'Authorization',
          'Bearer ' || current_setting('app.sms_dispatch_secret', true),
          'Content-Type', 'application/json'
        ),
        body := '{}'::jsonb
      );
      $cron$
    );
  ELSE
    RAISE NOTICE
      'pg_cron / pg_net not installed — vip-lifecycle and sms-dispatch will not '
      'run automatically. Enable both extensions or use Vercel Cron instead.';
  END IF;
END $$;
