-- Optional manual price-per-m² override for landing zone cards.
-- When NULL (default), the landing "price per zone" widget auto-computes the
-- average from active sale listings. When set, admins force a fixed value
-- (in ₾/m²) regardless of listing data. Additive + non-destructive.
-- Down: ALTER TABLE public.zones DROP COLUMN price_per_sqm_override;

ALTER TABLE public.zones
  ADD COLUMN IF NOT EXISTS price_per_sqm_override INTEGER
  CHECK (price_per_sqm_override IS NULL OR price_per_sqm_override >= 0);
