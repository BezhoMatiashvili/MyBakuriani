-- Populate the demo example listing 33333333-3333-4333-8333-000000000001 with
-- full investment data so the sales detail page renders the complete Figma
-- design (metrics box, construction-process card, map, 12-photo gallery).
--
-- This is an APPROVED, intentional overwrite of a single demo row (the example
-- URL used for design verification). It is idempotent (safe to re-run) and the
-- original values are documented below for rollback. No other rows are touched.
--
-- Sample images use images.unsplash.com (already allow-listed in next.config),
-- and can be swapped for production photos later.
--
-- Rollback (restore original "მზიური" demo content):
--   UPDATE public.properties SET
--     title = 'აპარტამენტი „მზიური"',
--     location = 'ბაკურიანი, ახალი უბანი',
--     area_sqm = 65,
--     sale_price = 85000,
--     photos = ARRAY['https://images.unsplash.com/photo-1560185127-6ed189bf02f4?w=800&h=600&fit=crop'],
--     description = 'ორი საძინებლით აპარტამენტი ახალ კორპუსში, სრული გარემონტებით.',
--     roi_percent = 12,
--     roi_percent_max = NULL,
--     cadastral_code = NULL,
--     construction_status = NULL,
--     construction_progress_percent = NULL,
--     completion_year = NULL,
--     renovation_status = NULL,
--     developer = NULL,
--     construction_image_url = NULL,
--     location_lat = NULL,
--     location_lng = NULL
--   WHERE id = '33333333-3333-4333-8333-000000000001';
--   (amenities: remove the appended 'complex_management' tag if desired.)

UPDATE public.properties
SET
  title = 'საინვესტიციო აპარტამენტი დიდველზე',
  location = 'დიდველი, კრისტალ რეზიდენს, კორპუსი B',
  type = 'apartment',
  area_sqm = 55.5,
  rooms = 2,
  sale_price = 65000,
  cadastral_code = '00.00.00.000',
  construction_status = 'under_construction',
  construction_progress_percent = 45,
  completion_year = 2026,
  renovation_status = 'white_frame',
  roi_percent = 12,
  roi_percent_max = 15,
  developer = 'CRYSTAL RESORT (BLOCK D)',
  location_lat = 41.7385,
  location_lng = 43.5175,
  is_for_sale = TRUE,
  status = 'active',
  construction_image_url = 'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=1200&h=800&fit=crop',
  photos = ARRAY[
    'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=1200&h=800&fit=crop',
    'https://images.unsplash.com/photo-1493809842364-78817add7ffb?w=1200&h=800&fit=crop',
    'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=1200&h=800&fit=crop',
    'https://images.unsplash.com/photo-1484154218962-a197022b5858?w=1200&h=800&fit=crop',
    'https://images.unsplash.com/photo-1556912173-3bb406ef7e77?w=1200&h=800&fit=crop',
    'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=1200&h=800&fit=crop',
    'https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?w=1200&h=800&fit=crop',
    'https://images.unsplash.com/photo-1586023492125-27b2c045efd7?w=1200&h=800&fit=crop',
    'https://images.unsplash.com/photo-1560185893-a55cbc8c57e8?w=1200&h=800&fit=crop',
    'https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?w=1200&h=800&fit=crop',
    'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=1200&h=800&fit=crop',
    'https://images.unsplash.com/photo-1449844908441-8829872d2607?w=1200&h=800&fit=crop'
  ],
  description = E'იყიდება პრემიუმ კლასის საინვესტიციო აპარტამენტი დიდველის ტერიტორიაზე, კომპლექს „CRYSTAL RESORT“-ის მე-B კორპუსში. ობიექტი მდებარეობს ცენტრალური პარკის შესასვლელთან, საბაგიროებსა და ინფრასტრუქტურასთან ფეხით სავალ მანძილზე. აპარტამენტი ბარდება თეთრი კარკასის მდგომარეობით, მშენებლობა სრულდება 2026 წელს.\n\nსაინვესტიციო თვალსაზრისით ობიექტი გამოირჩევა მაღალი მოსალოდნელი უკუგებით (ROI 12-15%), რასაც განაპირობებს დიდველის მზარდი ტურისტული ნაკადი და კომპლექსის პროფესიონალური მენეჯმენტი, რომელიც უზრუნველყოფს გაქირავებას მფლობელის ჩართულობის გარეშე.'
WHERE id = '33333333-3333-4333-8333-000000000001';

-- Append the complex-management amenity tag (drives the "გაყიდვის სტატუსი:
-- აქვს კომპლექსის მენეჯმენტი" metric). Guarded so it is not duplicated on re-run.
UPDATE public.properties
SET amenities = COALESCE(amenities, '[]'::jsonb) || '["complex_management"]'::jsonb
WHERE id = '33333333-3333-4333-8333-000000000001'
  AND (amenities IS NULL OR NOT (amenities ? 'complex_management'));
