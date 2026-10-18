-- Public views stop advertising a VIP / SUPER VIP the moment it expires.
--
-- 2026 price list (MyBakuriani_ფასების_ცხრილი_და_განმარტებები_2026.docx §2): every VIP
-- service lasts 24 hours. purchase_package writes vip_expires_at = now() + 24 h, but the
-- flags themselves are only cleared by the DAILY vip-lifecycle job (06:30 UTC), and the
-- public views exposed the raw flags — so a 24 h VIP/SUPER VIP kept its badge and its
-- ranking for up to ~24 h longer. Every public read (landing, grids, search re-read,
-- detail pages) goes through these two views, so the expiry is applied here, at read
-- time: a flag counts only while vip_expires_at is NULL (admin-granted, fail-open like
-- isSuperVipActive/isDiscountActive) or in the future. The cron job still does the
-- write-side cleanup; owner dashboards read the base tables with expiry-aware helpers.
--
-- Both statements are the latest repo definitions (20260919120000 for public_properties,
-- 20260816120000 for public_services) with ONLY the is_vip / is_super_vip expressions
-- changed; column names, order and types are unchanged, so CREATE OR REPLACE is valid
-- and existing grants are kept.
--
-- Options: CREATE OR REPLACE VIEW REPLACES the reloptions list, so they are stated in
-- full. security_barrier = true is restored on public_properties — 20260815125000 set
-- it on all public views, 20260919120000 dropped it by restating the view without it
-- (20260816121000 had to repair public_services after the same trap).

CREATE OR REPLACE VIEW public.public_properties
WITH (security_barrier = true, security_invoker = false) AS
SELECT pr.id, pr.type, pr.title, pr.description, pr.location, pr.location_lat, pr.location_lng,
       CASE WHEN pr.cadastral_code_public THEN pr.cadastral_code ELSE NULL END AS cadastral_code,
       pr.area_sqm, pr.rooms, pr.bathrooms, pr.capacity, pr.price_per_night,
       pr.sale_price, pr.currency, pr.amenities, pr.photos, (pr.is_vip AND (pr.vip_expires_at IS NULL OR pr.vip_expires_at > now())) AS is_vip,
       (pr.is_super_vip AND (pr.vip_expires_at IS NULL OR pr.vip_expires_at > now())) AS is_super_vip,
       pr.vip_expires_at,
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
WITH (security_barrier = true, security_invoker = false) AS
SELECT s.id, s.category, s.title, s.description, s.price, s.price_unit, s.currency, s.photos,
       s.location, s.schedule, s.discount_percent,
       (s.is_vip AND (s.vip_expires_at IS NULL OR s.vip_expires_at > now())) AS is_vip,
       s.views_count, s.driver_name,
       s.vehicle_capacity, s.route, s.cuisine_type, s.has_delivery, s.operating_hours, s.menu,
       s.position, s.salary_range, s.experience_required, s.employment_schedule, s.created_at,
       s.updated_at, s.is_new, s.avg_check, s.menu_url, s.has_kids_area, s.has_lounge,
       s.has_live_music, s.employment_type, s.work_schedule, s.salary_type, s.salary_min,
       s.salary_max, s.salary_daily, s.accommodation, s.meals, s.requirements, s.languages,
       s.service_field, s.provider_name, s.rating, s.reviews_count, s.safety_notes, s.activity_type,
       s.activity_category, s.duration, s.age_min, s.good_for, s.coords, s.restaurant_type,
       (s.is_super_vip AND (s.vip_expires_at IS NULL OR s.vip_expires_at > now())) AS is_super_vip,
       s.vip_expires_at, s.menu_views_count, s.vehicle_color, s.features,
       s.route_pricing, s.discount_expires_at,
       p.display_name as profile_display_name, p.avatar_url as profile_avatar_url,
       p.is_verified as profile_is_verified,
       regexp_replace(coalesce(s.whatsapp, ''), '[^0-9]', '', 'g') ~ '^(995)?5[0-9]{8}$' as has_whatsapp,
       CASE WHEN s.category = 'food' THEN EXISTS (
         SELECT 1 FROM public.service_menu_items mi
         WHERE mi.service_id = s.id
           AND coalesce(mi.discount_percent, 0) > 0
           AND (mi.discount_expires_at IS NULL OR mi.discount_expires_at > now())
       )
       ELSE coalesce(s.discount_percent, 0) > 0
         AND (s.discount_expires_at IS NULL OR s.discount_expires_at > now())
       END as has_active_discount,
       s.vehicle_make, s.transport_type, s.routes, s.equipment,
       (SELECT max(mi.discount_percent) FROM public.service_menu_items mi
        WHERE mi.service_id = s.id
          AND coalesce(mi.discount_percent, 0) > 0
          AND (mi.discount_expires_at IS NULL OR mi.discount_expires_at > now())
       ) as best_active_menu_item_discount_percent
FROM public.services s
LEFT JOIN public.profiles p on p.id = s.owner_id
WHERE s.status = 'active';

NOTIFY pgrst, 'reload schema';
