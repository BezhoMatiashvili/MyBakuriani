-- 20261011120000_food_whole_menu_discount.sql
--
-- Restaurant discounts (contract C21), 2026-10-11. A restaurant now has two
-- discounts, both sold as the "ფასდაკლების ბეიჯი" package:
--   * the whole menu: services.discount_percent / discount_expires_at, bought
--     through purchase_package's discount tier on the restaurant, exactly as
--     every other listing buys it (C10). It needs no typed dishes, so a
--     restaurant with only a PDF menu or a link can run it;
--   * single dishes: service_menu_items.discount_percent / discount_expires_at
--     (self_service_activate_menu_item_discount, unchanged).
-- Both may run at once; a dish then costs the larger of the two percents.
--
-- The food dashboard's discount buttons used to send the owner to the menu
-- page (the whole-listing food discount was retired on 2026-08-16), and this
-- view's food branch ignored services.discount_percent, so a whole-menu
-- discount was invisible to guests. Only that branch changes: food counts as
-- discounted while either discount is active.
--
-- GENERATED, not retyped: the SELECT is the live pg_get_viewdef() text of
-- public_services on staging (2026-10-11, identical to 20261001200100) with
-- only the food branch of has_active_discount changed. Every column keeps its
-- name, type and position, so CREATE OR REPLACE is valid and the SELECT grants
-- are kept (anon/authenticated SELECT only, C34). CREATE OR REPLACE VIEW
-- replaces the reloptions list, so both options are restated.
--
-- Prod order: after 20261001200100 (the view carries ownership_verified).
-- Apply before the app: the app's food cards read services.discount_percent
-- either way, but without this the home page and /food do not sort a
-- whole-menu discount first.

SET LOCAL search_path = public;

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
            WHEN (s.category = 'food'::service_category) THEN (((COALESCE(s.discount_percent, 0) > 0) AND ((s.discount_expires_at IS NULL) OR (s.discount_expires_at > now()))) OR (EXISTS ( SELECT 1
               FROM service_menu_items mi
              WHERE ((mi.service_id = s.id) AND (COALESCE(mi.discount_percent, 0) > 0) AND ((mi.discount_expires_at IS NULL) OR (mi.discount_expires_at > now()))))))
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
