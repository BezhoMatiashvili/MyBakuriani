-- 20261004120000_public_properties_hide_rentals_without_membership.sql
--
-- Seasonal renter membership (contract C31): a rental listing (is_for_sale
-- false or NULL, hotels included) is public only while its owner holds a
-- membership that is active right now. Before this, the membership was checked
-- only when a rental was created (properties_require_rental_membership), so a
-- listing stayed public after the season it was paid for had ended.
--
-- The predicate is the posting gate's, word for word: status = 'active' AND
-- starts_at <= now() AND expires_at > now() (also
-- src/lib/membership/plans.ts:isMembershipActiveAt). It is evaluated at read
-- time, so nothing is written to the listing: it disappears the moment the
-- season ends and comes back as soon as a renewal is approved, or exactly when
-- a pre-bought season starts. A paid request awaiting admin review does not
-- count. It applies to every owner, admins included; sales are unaffected.
-- The owner still sees the listing in their dashboard (base-table RLS).
--
-- Every public surface reads this view (category pages, detail pages, search
-- edge function, sitemap, favorites, recently viewed, related listings). The
-- contact reveal route checks it too. Detail pages are ISR (C28), so a lapsed
-- listing leaves the edge within the revalidate + stale-while-revalidate window.
--
-- GENERATED, not retyped: the SELECT below is copied by script from
-- 20261001200100 (itself the live staging pg_get_viewdef text); only the WHERE
-- gains the membership clause. Columns keep name, type and order, so CREATE OR
-- REPLACE is valid and the SELECT grants stay. The EXISTS runs with the view
-- owner's rights (security_invoker = false), so anon needs no grant on
-- user_subscriptions.
--
-- Prod: apply only together with the seasonal membership batch
-- (20260925130000-136000). On a database where nobody holds a membership this
-- hides every rental.

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
  WHERE ((pr.status = 'active'::listing_status) AND ((pr.organization_id IS NULL) OR (o.id IS NOT NULL))
    AND (COALESCE(pr.is_for_sale, false) OR (EXISTS ( SELECT 1
           FROM public.user_subscriptions s
          WHERE ((s.user_id = pr.owner_id) AND (s.status = 'active'::text) AND (s.starts_at <= now()) AND (s.expires_at > now()))))));

NOTIFY pgrst, 'reload schema';
