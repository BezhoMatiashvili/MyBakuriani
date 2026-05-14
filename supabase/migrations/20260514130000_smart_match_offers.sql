-- Add zone column to smart_match_requests for targeting renters by location
ALTER TABLE smart_match_requests ADD COLUMN IF NOT EXISTS zone TEXT;

-- Create smart_match_offers table to store renter offers on guest requests
CREATE TABLE IF NOT EXISTS smart_match_offers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  request_id UUID NOT NULL REFERENCES smart_match_requests(id) ON DELETE CASCADE,
  renter_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  offered_price NUMERIC(10,2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  guest_seen BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (request_id, property_id)
);

CREATE INDEX IF NOT EXISTS idx_sm_offers_request ON smart_match_offers(request_id);
CREATE INDEX IF NOT EXISTS idx_sm_offers_renter ON smart_match_offers(renter_id);
CREATE INDEX IF NOT EXISTS idx_sm_offers_status ON smart_match_offers(status);

ALTER TABLE smart_match_offers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "guest_read_own_offers" ON smart_match_offers;
CREATE POLICY "guest_read_own_offers" ON smart_match_offers FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM smart_match_requests r
      WHERE r.id = smart_match_offers.request_id AND r.guest_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "guest_update_own_offers" ON smart_match_offers;
CREATE POLICY "guest_update_own_offers" ON smart_match_offers FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM smart_match_requests r
      WHERE r.id = smart_match_offers.request_id AND r.guest_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "renter_insert_offers" ON smart_match_offers;
CREATE POLICY "renter_insert_offers" ON smart_match_offers FOR INSERT
  WITH CHECK (
    renter_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM properties p
      WHERE p.id = smart_match_offers.property_id AND p.owner_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "renter_read_own_offers" ON smart_match_offers;
CREATE POLICY "renter_read_own_offers" ON smart_match_offers FOR SELECT
  USING (renter_id = auth.uid());

DROP POLICY IF EXISTS "renter_update_own_offers" ON smart_match_offers;
CREATE POLICY "renter_update_own_offers" ON smart_match_offers FOR UPDATE
  USING (renter_id = auth.uid());
