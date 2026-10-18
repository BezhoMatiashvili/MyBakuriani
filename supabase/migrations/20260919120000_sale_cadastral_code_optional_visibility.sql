-- The sale form's cadastral code becomes optional; when a seller does enter
-- one, they can choose whether it's shown publicly. "Hidden" means hidden
-- everywhere public: the public_properties view masks the value itself
-- (rather than exposing a flag for callers to check), so a hidden code is
-- also excluded from cadastral search/filter matching on /sales/all, the
-- landing page's cadastral search box, and the `search` edge function —
-- all three read from this view, not the base table.
ALTER TABLE public.properties
  ADD COLUMN cadastral_code_public boolean NOT NULL DEFAULT true;

-- Full redefinition of public_properties, identical to the one in
-- 20260727120000_public_listing_whatsapp_availability.sql except the
-- cadastral_code expression is now masked in place. Changing an existing
-- column's expression (same name, compatible type) is legal for
-- CREATE OR REPLACE VIEW; only adding a NEW column would need to go last.
CREATE OR REPLACE VIEW public.public_properties
WITH (security_invoker = false) AS
SELECT pr.id, pr.type, pr.title, pr.description, pr.location, pr.location_lat, pr.location_lng,
       CASE WHEN pr.cadastral_code_public THEN pr.cadastral_code ELSE NULL END AS cadastral_code,
       pr.area_sqm, pr.rooms, pr.bathrooms, pr.capacity, pr.price_per_night,
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

NOTIFY pgrst, 'reload schema';
