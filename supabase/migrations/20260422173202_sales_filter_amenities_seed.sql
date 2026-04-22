-- Backfill amenity tags on existing sale properties so the Figma filter panel
-- produces visibly different result sets. All updates are idempotent: they only
-- append tags that are missing, and only touch rows where is_for_sale = true.
-- Never overwrites existing data.

UPDATE properties SET amenities = amenities || '["წყალი"]'::jsonb
WHERE is_for_sale = true AND status = 'active' AND NOT (amenities ? 'წყალი');

UPDATE properties SET amenities = amenities || '["გაზი"]'::jsonb
WHERE is_for_sale = true AND status = 'active' AND NOT (amenities ? 'გაზი');

UPDATE properties SET amenities = amenities || '["აივანი"]'::jsonb
WHERE is_for_sale = true AND status = 'active' AND NOT (amenities ? 'აივანი');

UPDATE properties SET amenities = amenities || '["ავეჯი"]'::jsonb
WHERE is_for_sale = true AND status = 'active'
  AND rooms >= 2
  AND NOT (amenities ? 'ავეჯი');

UPDATE properties SET amenities = amenities || '["ფარდული"]'::jsonb
WHERE is_for_sale = true AND status = 'active'
  AND rooms >= 3
  AND NOT (amenities ? 'ფარდული');

UPDATE properties SET amenities = amenities || '["payment:cash"]'::jsonb
WHERE is_for_sale = true AND status = 'active'
  AND NOT (amenities ? 'payment:cash');

UPDATE properties SET amenities = amenities || '["payment:mortgage"]'::jsonb
WHERE is_for_sale = true AND status = 'active'
  AND rooms >= 2
  AND NOT (amenities ? 'payment:mortgage');

UPDATE properties SET amenities = amenities || '["payment:installment"]'::jsonb
WHERE is_for_sale = true AND status = 'active'
  AND rooms BETWEEN 1 AND 3
  AND NOT (amenities ? 'payment:installment');

UPDATE properties SET developer = 'Moritori Gardens'
WHERE is_for_sale = true AND status = 'active'
  AND id = 'd0000000-0000-0000-0000-000000000002'
  AND developer IS NULL;

UPDATE properties SET developer = 'Crystal Resort'
WHERE is_for_sale = true AND status = 'active'
  AND id = 'd0000000-0000-0000-0000-000000000003'
  AND developer IS NULL;
