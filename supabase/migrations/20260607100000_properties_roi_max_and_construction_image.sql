-- Additive, null-safe columns for the investment sales detail page.
-- roi_percent_max: upper bound so ROI can render as a range (e.g. "12-15%"),
--   paired with roi_percent. NULL = single value.
-- construction_image_url: aerial/render shown on the construction-process card,
--   distinct from the gallery hero (photos[0]). NULL = fall back to photos[0].
-- The existing public read policy on properties already covers both columns,
-- so no RLS changes are required.

ALTER TABLE public.properties
  ADD COLUMN IF NOT EXISTS roi_percent_max NUMERIC(4, 1),
  ADD COLUMN IF NOT EXISTS construction_image_url TEXT;

COMMENT ON COLUMN public.properties.roi_percent_max IS
  'Upper bound of expected ROI range; pair with roi_percent. NULL = single value.';
COMMENT ON COLUMN public.properties.construction_image_url IS
  'Image for the construction-process card (aerial/render). NULL = fall back to photos[0].';

-- Rollback:
--   ALTER TABLE public.properties
--     DROP COLUMN IF EXISTS roi_percent_max,
--     DROP COLUMN IF EXISTS construction_image_url;
