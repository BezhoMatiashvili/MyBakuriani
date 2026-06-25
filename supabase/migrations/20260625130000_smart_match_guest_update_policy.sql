-- Smart Match: let a guest update (e.g. cancel) their own request.
--
-- smart_match_requests previously had only "Users see own requests" (SELECT) and
-- "Users create own requests" (INSERT) policies for the guest. Without an UPDATE
-- policy, RLS silently blocked the guest from cancelling a request. The guest
-- dashboard cancels a request by setting status = 'cancelled' (non-destructive;
-- never a DELETE). A cancelled request automatically disappears from renters,
-- whose visibility policy + query both require status = 'active'.
--
-- Non-destructive: adds a policy only. Rollback:
--   DROP POLICY IF EXISTS "Users update own requests" ON smart_match_requests;

DROP POLICY IF EXISTS "Users update own requests" ON smart_match_requests;
CREATE POLICY "Users update own requests" ON smart_match_requests
  FOR UPDATE
  USING (guest_id = auth.uid())
  WITH CHECK (guest_id = auth.uid());
