-- Realtime (websocket) publication coverage
--
-- Ensures every table that backs a live dataflow in the app is a member of the
-- `supabase_realtime` publication, so the client `postgres_changes` subscriptions
-- actually receive INSERT/UPDATE/DELETE events. Realtime respects RLS, so each
-- subscriber only receives rows it is already allowed to SELECT.
--
-- Why this migration exists:
--   * notifications / smart_match_requests / smart_match_offers were already added
--     in 20260516120000_smart_match_flow_fix.sql.
--   * balances / cleaning_tasks / sms_messages / job_applications / calendar_blocks /
--     price_overrides had subscriptions in the app but were only added to the
--     publication via the Supabase dashboard — so they were NOT reproducible from
--     migrations. This codifies them.
--   * transactions / properties / bookings / services are newly subscribed to
--     (live balance history, live listing status / VIP / view counts, live new
--     bookings, and live service status / inquiries) and need to be added.
--
-- Safe & additive: each ADD is guarded by a pg_publication_tables check, so this is
-- idempotent and a no-op for tables already published. It removes nothing.
--
-- To reverse (if ever needed), for the tables added here that you want to stop
-- streaming:  ALTER PUBLICATION supabase_realtime DROP TABLE <table>;
--
-- Note on REPLICA IDENTITY: the client merge logic keys rows by primary key and
-- reads payload.new for INSERT/UPDATE (always full) and payload.old's PK for DELETE
-- (present under the default replica identity), so REPLICA IDENTITY FULL is not
-- required for these dataflows and is intentionally left unchanged.

DO $$
DECLARE
  t text;
  realtime_tables text[] := ARRAY[
    'notifications',
    'smart_match_requests',
    'smart_match_offers',
    'balances',
    'transactions',
    'properties',
    'bookings',
    'services',
    'cleaning_tasks',
    'sms_messages',
    'job_applications',
    'calendar_blocks',
    'price_overrides'
  ];
BEGIN
  FOREACH t IN ARRAY realtime_tables LOOP
    -- Only add tables that exist and are not already in the publication.
    IF EXISTS (
      SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = t
    ) AND NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
      RAISE NOTICE 'Added %.% to supabase_realtime publication', 'public', t;
    END IF;
  END LOOP;
END $$;
