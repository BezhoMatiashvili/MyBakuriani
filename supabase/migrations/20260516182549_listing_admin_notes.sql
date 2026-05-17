-- Admin moderation notes for listings.
-- properties + services need a place to store rejection / approval notes
-- so the unified admin verifications queue can flow back to the owner.

ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS admin_notes TEXT;

ALTER TABLE services
  ADD COLUMN IF NOT EXISTS admin_notes TEXT;
