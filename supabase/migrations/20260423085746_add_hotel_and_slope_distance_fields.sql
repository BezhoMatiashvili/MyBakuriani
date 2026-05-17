-- Add fields needed for 100% Figma design match
ALTER TABLE public.properties
  ADD COLUMN IF NOT EXISTS distance_to_slope_m INTEGER,
  ADD COLUMN IF NOT EXISTS hotel_stars SMALLINT CHECK (hotel_stars BETWEEN 1 AND 5),
  ADD COLUMN IF NOT EXISTS numeric_rating NUMERIC(3,1) CHECK (numeric_rating BETWEEN 0 AND 10),
  ADD COLUMN IF NOT EXISTS room_type TEXT,
  ADD COLUMN IF NOT EXISTS is_b2b_partner BOOLEAN DEFAULT FALSE;

COMMENT ON COLUMN public.properties.distance_to_slope_m IS 'Distance in meters to nearest ski slope (for rentals/apartments location display)';
COMMENT ON COLUMN public.properties.hotel_stars IS 'Official hotel star rating 1-5 (hotels only)';
COMMENT ON COLUMN public.properties.numeric_rating IS 'Aggregated guest rating 0.0-10.0 (e.g., 9.2)';
COMMENT ON COLUMN public.properties.room_type IS 'Hotel room type label (e.g., "სტანდარტული ოთახი")';
COMMENT ON COLUMN public.properties.is_b2b_partner IS 'Whether property is a B2B partner (displays B2B badge)';
