-- Smart Match flow: unblock the guest → renter request pipeline.
--
-- Three issues this migration fixes (each verified against live pg_policies / pg_publication_tables):
--   1. smart_match_requests had only a "guest owns row" SELECT policy, so renters
--      could not see other guests' requests and the renter dashboard always showed
--      its empty state.
--   2. notifications had no INSERT policy for regular users (only admin ALL), so
--      both the request-created and offer-created notification inserts in the
--      client code silently failed under RLS.
--   3. None of the three tables involved in this flow were members of the
--      supabase_realtime publication, so the existing postgres_changes channels
--      never received events.

-- 1. Renters (owners of at least one active rental property) can read active
--    smart-match requests.
DROP POLICY IF EXISTS "Renters view active requests" ON smart_match_requests;
CREATE POLICY "Renters view active requests" ON smart_match_requests
  FOR SELECT
  USING (
    status = 'active'
    AND EXISTS (
      SELECT 1 FROM properties p
      WHERE p.owner_id = auth.uid()
        AND p.status = 'active'
        AND p.is_for_sale = false
    )
  );

CREATE INDEX IF NOT EXISTS idx_properties_owner_active_rental
  ON properties(owner_id) WHERE status = 'active' AND is_for_sale = false;

-- 2. Authenticated users can insert the two smart-match notification types.
--    Recipient must be plausibly relevant: a renter for request notifications,
--    a guest with at least one existing request for offer notifications.
DROP POLICY IF EXISTS "Smart match notifications insert" ON notifications;
CREATE POLICY "Smart match notifications insert" ON notifications
  FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND (
      (type = 'smart_match_request' AND EXISTS (
        SELECT 1 FROM properties p
        WHERE p.owner_id = notifications.user_id
          AND p.status = 'active'
          AND p.is_for_sale = false
      ))
      OR
      (type = 'smart_match_offer' AND EXISTS (
        SELECT 1 FROM smart_match_requests r
        WHERE r.guest_id = notifications.user_id
      ))
    )
  );

-- 3. Add the three tables to the supabase_realtime publication.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'smart_match_requests'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE smart_match_requests;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'smart_match_offers'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE smart_match_offers;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'notifications'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
  END IF;
END $$;
