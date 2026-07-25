-- Retires the Google-Routes-backed road-condition pipeline.
--
-- The landing hero's "გზა თბილისიდან" card now derives its value from a keyless
-- OpenStreetMap (FOSSGIS/OSRM) routing call made inline in
-- src/lib/road-condition/server.ts — the same shape as the live weather card. The
-- table, the 30-minute cron job and the road-condition-refresh edge function existed
-- only because Google Routes was a paid, keyed API; with a free keyless provider they
-- have no remaining reader or writer.
--
-- The job never once succeeded: app.road_condition_url was never set (it requires an
-- owner-role ALTER DATABASE in the Dashboard SQL editor), so every run posted to a
-- NULL url and the seeded row still reads status_code='unknown' with all metrics NULL.
-- Nothing of value is lost here.
--
-- Deploy-order independent: dropping the table before the new app ships makes the OLD
-- getRoadCondition() return null, which already falls back to the admin card value, so
-- nothing user-visible breaks in either order.
--
-- The edge function itself must be deleted separately — SQL cannot remove it:
--   npx supabase functions delete road-condition-refresh --project-ref <ref>
-- app.road_condition_url / app.road_condition_secret were never set, so there is no
-- ALTER DATABASE ... RESET to run.

-- Unschedule first: dropping the table alone would leave the job firing forever.
-- Guarded so this migration still applies on an instance without pg_cron.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobid)
    FROM cron.job
    WHERE jobname = 'road-condition-30min';
  END IF;
END $$;

-- CASCADE takes the road_conditions_set_updated_at trigger and both RLS policies with
-- the table. The trigger FUNCTION is a standalone object used by this table only
-- (20260724130000_road_condition_table.sql), so it must be dropped explicitly.
DROP TABLE IF EXISTS public.road_conditions CASCADE;
DROP FUNCTION IF EXISTS public.touch_road_conditions_updated_at();

-- PostgREST caches the schema; without this the dropped relation lingers in its cache.
NOTIFY pgrst, 'reload schema';
