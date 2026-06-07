-- Add vehicle color + features (amenities) columns to services for richer
-- transport cards. Additive, nullable, non-destructive.
-- Rollback: ALTER TABLE public.services
--   DROP COLUMN IF EXISTS vehicle_color, DROP COLUMN IF EXISTS features;
ALTER TABLE public.services
  ADD COLUMN IF NOT EXISTS vehicle_color text,
  ADD COLUMN IF NOT EXISTS features text[] DEFAULT '{}'::text[];
