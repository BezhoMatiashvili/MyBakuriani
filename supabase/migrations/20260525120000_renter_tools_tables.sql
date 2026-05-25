-- Renter tooling tables: guests, cleaners, manual bookings.
-- All owner-scoped (owner_id = the renter), RLS modeled on calendar_blocks/properties.
-- Additive only — no changes to existing tables.

-- Guests database (Bug 3)
CREATE TABLE renter_guests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  phone TEXT,
  visit_dates TEXT,        -- free text e.g. "10-12 თებ."
  note TEXT,
  blacklisted BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_renter_guests_owner ON renter_guests(owner_id);

ALTER TABLE renter_guests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners manage own guests" ON renter_guests
  FOR ALL USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

-- Cleaners directory (Bug 4)
CREATE TABLE renter_cleaners (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  phone TEXT,
  price_standard NUMERIC(10,2),
  price_general NUMERIC(10,2),
  available BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_renter_cleaners_owner ON renter_cleaners(owner_id);

ALTER TABLE renter_cleaners ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners manage own cleaners" ON renter_cleaners
  FOR ALL USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

-- Manual (walk-in) bookings (Bug 6) — guests here are not platform profiles.
CREATE TABLE manual_bookings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  check_in DATE NOT NULL,
  check_out DATE NOT NULL,
  source TEXT,             -- room/source ref, e.g. "#101"
  guest_name TEXT,
  status TEXT NOT NULL DEFAULT 'manual',  -- 'manual' | 'booked'
  client_list TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_manual_bookings_owner ON manual_bookings(owner_id);
CREATE INDEX idx_manual_bookings_property ON manual_bookings(property_id);

ALTER TABLE manual_bookings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners manage own manual bookings" ON manual_bookings
  FOR ALL USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
