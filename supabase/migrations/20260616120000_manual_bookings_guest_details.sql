-- Optional guest-detail columns for renter-managed manual bookings.
-- Additive only — all columns nullable, existing rows unaffected.
-- RLS unchanged: "Owners manage own manual bookings" (FOR ALL, owner_id = auth.uid())
-- already governs insert/update/delete on these columns.
--
-- Rollback:
--   ALTER TABLE manual_bookings
--     DROP COLUMN guest_phone, DROP COLUMN guests_count,
--     DROP COLUMN amount, DROP COLUMN note;

ALTER TABLE manual_bookings
  ADD COLUMN IF NOT EXISTS guest_phone  TEXT,
  ADD COLUMN IF NOT EXISTS guests_count INT,
  ADD COLUMN IF NOT EXISTS amount       NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS note         TEXT;
