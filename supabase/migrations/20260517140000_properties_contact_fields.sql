-- Add listing-level contact fields to properties so rental & sale forms
-- can store phone / whatsapp independently of the owner profile.

ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS phone TEXT,
  ADD COLUMN IF NOT EXISTS whatsapp TEXT;

COMMENT ON COLUMN properties.phone IS 'Listing contact phone in E.164 format (e.g. +9955XXXXXXXX)';
COMMENT ON COLUMN properties.whatsapp IS 'Optional listing WhatsApp number in E.164 format';
