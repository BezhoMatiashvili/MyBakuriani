-- Public listing views intentionally never expose phone or WhatsApp values.
-- This derived flag lets the UI offer WhatsApp only when the optional listing
-- value is a normalizable Georgian mobile number.
CREATE OR REPLACE VIEW public.public_properties
WITH (security_invoker = false) AS
SELECT pr.id, pr.type, pr.title, pr.description, pr.location, pr.location_lat, pr.location_lng,
       pr.cadastral_code, pr.area_sqm, pr.rooms, pr.bathrooms, pr.capacity, pr.price_per_night,
       pr.sale_price, pr.currency, pr.amenities, pr.photos, pr.is_vip, pr.is_super_vip, pr.vip_expires_at,
       pr.discount_percent, pr.views_count, pr.house_rules, pr.min_booking_days, pr.is_for_sale,
       pr.roi_percent, pr.construction_status, pr.developer, pr.created_at, pr.updated_at,
       pr.cleaning_fee, pr.distance_to_slope_m, pr.hotel_stars, pr.numeric_rating,
       pr.room_type, pr.is_b2b_partner, pr.renovation_status, pr.completion_year, pr.progress_note,
       pr.progress_note_updated_at, pr.construction_progress_percent, pr.units_total, pr.units_sold,
       pr.units_reserved, pr.construction_stages, pr.registration_readiness, pr.roi_percent_max,
       pr.construction_image_url, pr.organization_id, pr.discount_expires_at,
       p.display_name AS profile_display_name, p.avatar_url AS profile_avatar_url,
       p.is_verified AS profile_is_verified,
       o.brand_name AS organization_brand_name, o.logo_url AS organization_logo_url,
       o.verified_at AS organization_verified_at, o.company_type AS organization_company_type,
       -- MUST stay last: CREATE OR REPLACE VIEW can only APPEND columns. Inserting
       -- this next to discount_expires_at renames the existing trailing columns and
       -- fails with 42P16.
       regexp_replace(COALESCE(pr.whatsapp, ''), '[^0-9]', '', 'g') ~ '^(995)?5[0-9]{8}$' AS has_whatsapp
FROM public.properties pr
LEFT JOIN public.profiles p ON p.id = pr.owner_id
LEFT JOIN public.organizations o ON o.id = pr.organization_id AND o.status = 'active'
WHERE pr.status = 'active' AND (pr.organization_id IS NULL OR o.id IS NOT NULL);

CREATE OR REPLACE VIEW public.public_services
WITH (security_invoker = false) AS
SELECT s.id, s.category, s.title, s.description, s.price, s.price_unit, s.currency, s.photos,
       s.location, s.schedule, s.discount_percent, s.is_vip, s.views_count, s.driver_name,
       s.vehicle_capacity, s.route, s.cuisine_type, s.has_delivery, s.operating_hours, s.menu,
       s.position, s.salary_range, s.experience_required, s.employment_schedule, s.created_at,
       s.updated_at, s.is_new, s.avg_check, s.menu_url, s.has_kids_area, s.has_lounge,
       s.has_live_music, s.employment_type, s.work_schedule, s.salary_type, s.salary_min,
       s.salary_max, s.salary_daily, s.accommodation, s.meals, s.requirements, s.languages,
       s.service_field, s.provider_name, s.rating, s.reviews_count, s.safety_notes, s.activity_type,
       s.activity_category, s.duration, s.age_min, s.good_for, s.coords, s.restaurant_type,
       s.is_super_vip, s.vip_expires_at, s.menu_views_count, s.vehicle_color, s.features,
       s.route_pricing, s.discount_expires_at,
       p.display_name AS profile_display_name, p.avatar_url AS profile_avatar_url,
       p.is_verified AS profile_is_verified,
       -- MUST stay last, same 42P16 reason as public_properties above.
       regexp_replace(COALESCE(s.whatsapp, ''), '[^0-9]', '', 'g') ~ '^(995)?5[0-9]{8}$' AS has_whatsapp
FROM public.services s
LEFT JOIN public.profiles p ON p.id = s.owner_id
WHERE s.status = 'active';

REVOKE ALL ON public.public_properties, public.public_services FROM PUBLIC;
GRANT SELECT ON public.public_properties, public.public_services TO anon, authenticated;
NOTIFY pgrst, 'reload schema';
