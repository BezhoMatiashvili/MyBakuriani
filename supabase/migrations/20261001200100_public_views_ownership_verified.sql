-- 20261001200100_public_views_ownership_verified.sql
--
-- Ownership verification badge (contract C39): public_properties and
-- public_services gain a LAST column `ownership_verified`, true while the
-- listing has an approved ownership_verifications row of its current owner.
-- The basis triggers from 20261001200000 close a request whenever the owner,
-- cadastral code, address or map pin (services: owner, title, provider name,
-- category) changes, so the stored status is the whole rule and the view needs
-- no snapshot comparison.
--
-- GENERATED, not retyped: each SELECT below is the live pg_get_viewdef() text
-- of the view on staging (2026-10-02) with only the new column inserted before
-- the top-level FROM. Every earlier column keeps its name, type and position,
-- so CREATE OR REPLACE is valid and the existing SELECT grants are kept.
-- CREATE OR REPLACE VIEW replaces the reloptions list, so both options are
-- restated in full. The EXISTS runs with the view owner's rights, so anon and
-- authenticated need no grant on ownership_verifications.
--
-- Deploy order: this migration before any code that selects
-- ownership_verified, or every list page answers 400.

SET LOCAL search_path = public;

CREATE OR REPLACE VIEW public.public_properties
WITH (security_barrier = true, security_invoker = false) AS
SELECT pr.id,
    pr.type,
    pr.title,
    pr.description,
    pr.location,
    pr.location_lat,
    pr.location_lng,
        CASE
            WHEN pr.cadastral_code_public THEN pr.cadastral_code
            ELSE NULL::text
        END AS cadastral_code,
    pr.area_sqm,
    pr.rooms,
    pr.bathrooms,
    pr.capacity,
    pr.price_per_night,
    pr.sale_price,
    pr.currency,
    pr.amenities,
    pr.photos,
    (pr.is_vip AND ((pr.vip_expires_at IS NULL) OR (pr.vip_expires_at > now()))) AS is_vip,
    (pr.is_super_vip AND ((pr.vip_expires_at IS NULL) OR (pr.vip_expires_at > now()))) AS is_super_vip,
    pr.vip_expires_at,
    pr.discount_percent,
    pr.views_count,
    pr.house_rules,
    pr.min_booking_days,
    pr.is_for_sale,
    pr.roi_percent,
    pr.construction_status,
    pr.developer,
    pr.created_at,
    pr.updated_at,
    pr.cleaning_fee,
    pr.distance_to_slope_m,
    pr.hotel_stars,
    pr.numeric_rating,
    pr.room_type,
    pr.is_b2b_partner,
    pr.renovation_status,
    pr.completion_year,
    pr.progress_note,
    pr.progress_note_updated_at,
    pr.construction_progress_percent,
    pr.units_total,
    pr.units_sold,
    pr.units_reserved,
    pr.construction_stages,
    pr.registration_readiness,
    pr.roi_percent_max,
    pr.construction_image_url,
    pr.organization_id,
    pr.discount_expires_at,
    p.display_name AS profile_display_name,
    p.avatar_url AS profile_avatar_url,
    p.is_verified AS profile_is_verified,
    o.brand_name AS organization_brand_name,
    o.logo_url AS organization_logo_url,
    o.verified_at AS organization_verified_at,
    o.company_type AS organization_company_type,
    (regexp_replace(COALESCE(pr.whatsapp, ''::text), '[^0-9]'::text, ''::text, 'g'::text) ~ '^(995)?5[0-9]{8}$'::text) AS has_whatsapp,
    (EXISTS ( SELECT 1
           FROM public.ownership_verifications ov
          WHERE ((ov.property_id = pr.id) AND (ov.status = 'approved'::text) AND (ov.owner_id = pr.owner_id)))) AS ownership_verified
   FROM ((properties pr
     LEFT JOIN profiles p ON ((p.id = pr.owner_id)))
     LEFT JOIN organizations o ON (((o.id = pr.organization_id) AND (o.status = 'active'::text))))
  WHERE ((pr.status = 'active'::listing_status) AND ((pr.organization_id IS NULL) OR (o.id IS NOT NULL)));

CREATE OR REPLACE VIEW public.public_services
WITH (security_barrier = true, security_invoker = false) AS
SELECT s.id,
    s.category,
    s.title,
    s.description,
    s.price,
    s.price_unit,
    s.currency,
    s.photos,
    s.location,
    s.schedule,
    s.discount_percent,
    (s.is_vip AND ((s.vip_expires_at IS NULL) OR (s.vip_expires_at > now()))) AS is_vip,
    s.views_count,
    s.driver_name,
    s.vehicle_capacity,
    s.route,
    s.cuisine_type,
    s.has_delivery,
    s.operating_hours,
    s.menu,
    s."position",
    s.salary_range,
    s.experience_required,
    s.employment_schedule,
    s.created_at,
    s.updated_at,
    s.is_new,
    s.avg_check,
    s.menu_url,
    s.has_kids_area,
    s.has_lounge,
    s.has_live_music,
    s.employment_type,
    s.work_schedule,
    s.salary_type,
    s.salary_min,
    s.salary_max,
    s.salary_daily,
    s.accommodation,
    s.meals,
    s.requirements,
    s.languages,
    s.service_field,
    s.provider_name,
    s.rating,
    s.reviews_count,
    s.safety_notes,
    s.activity_type,
    s.activity_category,
    s.duration,
    s.age_min,
    s.good_for,
    s.coords,
    s.restaurant_type,
    (s.is_super_vip AND ((s.vip_expires_at IS NULL) OR (s.vip_expires_at > now()))) AS is_super_vip,
    s.vip_expires_at,
    s.menu_views_count,
    s.vehicle_color,
    s.features,
    s.route_pricing,
    s.discount_expires_at,
    p.display_name AS profile_display_name,
    p.avatar_url AS profile_avatar_url,
    p.is_verified AS profile_is_verified,
    (regexp_replace(COALESCE(s.whatsapp, ''::text), '[^0-9]'::text, ''::text, 'g'::text) ~ '^(995)?5[0-9]{8}$'::text) AS has_whatsapp,
        CASE
            WHEN (s.category = 'food'::service_category) THEN (EXISTS ( SELECT 1
               FROM service_menu_items mi
              WHERE ((mi.service_id = s.id) AND (COALESCE(mi.discount_percent, 0) > 0) AND ((mi.discount_expires_at IS NULL) OR (mi.discount_expires_at > now())))))
            ELSE ((COALESCE(s.discount_percent, 0) > 0) AND ((s.discount_expires_at IS NULL) OR (s.discount_expires_at > now())))
        END AS has_active_discount,
    s.vehicle_make,
    s.transport_type,
    s.routes,
    s.equipment,
    ( SELECT max(mi.discount_percent) AS max
           FROM service_menu_items mi
          WHERE ((mi.service_id = s.id) AND (COALESCE(mi.discount_percent, 0) > 0) AND ((mi.discount_expires_at IS NULL) OR (mi.discount_expires_at > now())))) AS best_active_menu_item_discount_percent,
    (EXISTS ( SELECT 1
           FROM public.ownership_verifications ov
          WHERE ((ov.service_id = s.id) AND (ov.status = 'approved'::text) AND (ov.owner_id = s.owner_id)))) AS ownership_verified
   FROM (services s
     LEFT JOIN profiles p ON ((p.id = s.owner_id)))
  WHERE (s.status = 'active'::listing_status);

NOTIFY pgrst, 'reload schema';
