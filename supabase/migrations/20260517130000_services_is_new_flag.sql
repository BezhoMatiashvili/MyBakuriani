-- Admin-toggled "new" flag for service listings (e.g. transport cards).
-- Drives the "ახალი" badge on listing cards; admin controls visibility per row.

ALTER TABLE services
  ADD COLUMN IF NOT EXISTS is_new BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN services.is_new IS
  'Admin-toggled flag to display the "ახალი" (new) badge on listing cards.';
