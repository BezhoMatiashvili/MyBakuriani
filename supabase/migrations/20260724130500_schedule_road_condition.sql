-- Cron schedule for the road-condition-refresh background job:
--   * road-condition-refresh — every 30 minutes, calls the Google Routes API
--     (traffic-aware) for Tbilisi -> Bakuriani and upserts public.road_conditions.
--
-- Prerequisites (run ONCE in the Supabase dashboard / SQL editor before this
-- runs in production — same pattern as 20260611000500_schedule_vip_and_sms_dispatch):
--
--   1. Enable extensions:
--        CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
--        CREATE EXTENSION IF NOT EXISTS pg_net  WITH SCHEMA extensions;
--
--   2. Store the edge-function URL + shared secret as Postgres settings:
--        ALTER DATABASE postgres SET app.road_condition_url =
--          'https://<project-ref>.supabase.co/functions/v1/road-condition-refresh';
--        ALTER DATABASE postgres SET app.road_condition_secret = '<random-secret>';
--
--   3. Set the matching edge-function secrets via `supabase secrets set`:
--        ROAD_CONDITION_SECRET=<same as app.road_condition_secret>
--        GOOGLE_MAPS_API_KEY=<Google Cloud key with the Routes API enabled>
--
-- If pg_cron isn't available on your plan, schedule the same HTTP call via
-- Vercel Cron hitting the function URL with the Bearer secret, and skip this.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_extension WHERE extname = 'pg_cron'
  ) AND EXISTS (
    SELECT 1 FROM pg_extension WHERE extname = 'pg_net'
  ) THEN
    -- road-condition-refresh: every 30 minutes.
    PERFORM cron.unschedule(jobid)
    FROM cron.job
    WHERE jobname = 'road-condition-30min';

    PERFORM cron.schedule(
      'road-condition-30min',
      '*/30 * * * *',
      $cron$
      SELECT net.http_post(
        url := current_setting('app.road_condition_url', true),
        headers := jsonb_build_object(
          'Authorization',
          'Bearer ' || current_setting('app.road_condition_secret', true),
          'Content-Type', 'application/json'
        ),
        body := '{}'::jsonb
      );
      $cron$
    );
  ELSE
    RAISE NOTICE
      'pg_cron / pg_net not installed — road-condition-refresh will not run '
      'automatically. Enable both extensions or use Vercel Cron instead.';
  END IF;
END $$;
