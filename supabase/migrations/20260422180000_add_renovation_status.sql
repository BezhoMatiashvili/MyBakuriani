-- Adds a nullable renovation_status column to properties so the Invest-mode
-- search can filter by finish level (shell / white-shell / furnished).
-- Additive, null-safe, no RLS changes required — public read policy on
-- properties already covers it.

ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS renovation_status TEXT;

COMMENT ON COLUMN properties.renovation_status IS
  'Finish/renovation level: black_frame | white_frame | furnished. NULL = not specified.';

CREATE INDEX IF NOT EXISTS idx_properties_renovation_status
  ON properties (renovation_status);
