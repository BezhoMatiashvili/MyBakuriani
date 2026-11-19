-- Public listing numbers (C61): one 8-digit, counting-up ID per listing,
-- shared by properties and services so no two listings ever have the same one.
-- Shown as "ID: 10000042" on listing pages, owner cabinets and admin; an exact
-- ID typed into the search box opens that listing.
--
-- Writers: only the DEFINER trigger listing_number_guard() (assigns on INSERT,
-- refuses any change on UPDATE). Clients have column-level INSERT/UPDATE
-- grants only (C34), so they can never write it; SELECT is table-wide.
--
-- The two public views below are generated from the live pg_get_viewdef
-- with listing_number appended as the LAST column. On prod, regenerate them
-- from prod's live definitions; never reuse this text blindly.

CREATE SEQUENCE public.listing_number_seq
  AS bigint START WITH 10000001 MINVALUE 10000001 NO CYCLE;
REVOKE ALL ON SEQUENCE public.listing_number_seq FROM PUBLIC, anon, authenticated;

ALTER TABLE public.properties ADD COLUMN listing_number bigint;
ALTER TABLE public.services ADD COLUMN listing_number bigint;

-- Backfill oldest first across both tables. Row triggers are switched off
-- for this one UPDATE so updated_at (C14 approval compares it), audit rows,
-- notifications and SMS hooks stay untouched; the migration is atomic.
ALTER TABLE public.properties DISABLE TRIGGER USER;
ALTER TABLE public.services DISABLE TRIGGER USER;

WITH numbered AS (
  SELECT kind, id,
         10000000 + row_number() OVER (ORDER BY created_at, id) AS n
  FROM (
    SELECT 'p'::text AS kind, id, created_at FROM public.properties
    UNION ALL
    SELECT 's'::text, id, created_at FROM public.services
  ) all_listings
)
UPDATE public.properties p SET listing_number = numbered.n
FROM numbered WHERE numbered.kind = 'p' AND numbered.id = p.id;

WITH numbered AS (
  SELECT kind, id,
         10000000 + row_number() OVER (ORDER BY created_at, id) AS n
  FROM (
    SELECT 'p'::text AS kind, id, created_at FROM public.properties
    UNION ALL
    SELECT 's'::text, id, created_at FROM public.services
  ) all_listings
)
UPDATE public.services s SET listing_number = numbered.n
FROM numbered WHERE numbered.kind = 's' AND numbered.id = s.id;

ALTER TABLE public.properties ENABLE TRIGGER USER;
ALTER TABLE public.services ENABLE TRIGGER USER;

SELECT setval(
  'public.listing_number_seq',
  GREATEST(
    10000001,
    COALESCE((SELECT max(listing_number) FROM public.properties), 0),
    COALESCE((SELECT max(listing_number) FROM public.services), 0)
  ),
  EXISTS (SELECT 1 FROM public.properties) OR EXISTS (SELECT 1 FROM public.services)
);

ALTER TABLE public.properties ALTER COLUMN listing_number SET NOT NULL;
ALTER TABLE public.services ALTER COLUMN listing_number SET NOT NULL;
CREATE UNIQUE INDEX properties_listing_number_key ON public.properties (listing_number);
CREATE UNIQUE INDEX services_listing_number_key ON public.services (listing_number);

CREATE FUNCTION public.listing_number_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.listing_number := nextval('public.listing_number_seq');
  ELSIF NEW.listing_number IS DISTINCT FROM OLD.listing_number THEN
    RAISE EXCEPTION 'listing_number_immutable' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.listing_number_guard() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER properties_listing_number_guard
  BEFORE INSERT OR UPDATE OF listing_number ON public.properties
  FOR EACH ROW EXECUTE FUNCTION public.listing_number_guard();
CREATE TRIGGER services_listing_number_guard
  BEFORE INSERT OR UPDATE OF listing_number ON public.services
  FOR EACH ROW EXECUTE FUNCTION public.listing_number_guard();

CREATE OR REPLACE VIEW public.public_properties
  WITH (security_barrier = true, security_invoker = false)
  AS SELECT pr.id,
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
           FROM ownership_verifications ov
          WHERE ((ov.property_id = pr.id) AND (ov.status = 'approved'::text) AND (ov.owner_id = pr.owner_id)))) AS ownership_verified,
    pr.hotel_rooms,
    pr.sale_price_gel,
    pr.sale_price_currency,
    pr.listing_number
   FROM ((properties pr
     LEFT JOIN profiles p ON ((p.id = pr.owner_id)))
     LEFT JOIN organizations o ON (((o.id = pr.organization_id) AND (o.status = 'active'::text))))
  WHERE ((pr.status = 'active'::listing_status) AND ((pr.organization_id IS NULL) OR (o.id IS NOT NULL)) AND (COALESCE(pr.is_for_sale, false) OR (EXISTS ( SELECT 1
           FROM user_subscriptions s
          WHERE ((s.user_id = pr.owner_id) AND (s.status = 'active'::text) AND (s.starts_at <= now()) AND (s.expires_at > now()))))));

CREATE OR REPLACE VIEW public.public_services
  WITH (security_barrier = true, security_invoker = false)
  AS SELECT s.id,
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
           FROM ownership_verifications ov
          WHERE ((ov.service_id = s.id) AND (ov.status = 'approved'::text) AND (ov.owner_id = s.owner_id)))) AS ownership_verified,
    s.listing_number
   FROM (services s
     LEFT JOIN profiles p ON ((p.id = s.owner_id)))
  WHERE (s.status = 'active'::listing_status);
