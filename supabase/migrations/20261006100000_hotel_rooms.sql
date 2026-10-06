-- 20261006100000_hotel_rooms.sql
--
-- Hotels (contract C45). A hotel was posted through the rental wizard as one
-- apartment-shaped row: one price, one room count, no star rating the owner
-- could set (hotel_stars had no client INSERT grant) and no rooms. This adds
-- the room list:
--
--   properties.hotel_rooms jsonb NOT NULL DEFAULT '[]'
--     [{ "name": text 1-60, "guests": int 1-20, "beds": int 1-20 | null,
--        "area_sqm": number (0, 1000] | null, "price": number (0, 100000],
--        "quantity": int 1-500, "photos": [storage url, ...] (at most 5) }, ...]
--     at most 30 entries, no other keys. The limits are
--     src/lib/hotel-rooms.ts's constants (scripts/unit/hotel-rooms.test.mjs
--     compares them with this file).
--
-- The CHECK is the only guard on approve_content_change_request's path (it
-- runs as the definer), so the shape lives in the database, not only in the
-- form. Availability stays per hotel (calendar_blocks is keyed on property and
-- date); the form writes price_per_night = the cheapest room, rooms = the room
-- count and capacity = the guests of all rooms, so cards, sorting, search and
-- the booking sidebar keep working unchanged.
--
-- hotel_rooms is public content: it joins the review-gate arrays (C14) of
-- prevent_unreviewed_public_content_update and approve_content_change_request.
-- Both are patched from their LIVE text (one anchor each, refused otherwise),
-- never retyped; CREATE OR REPLACE keeps their owner, ACL and SECURITY mode.
-- authenticated gains INSERT on hotel_stars and hotel_rooms (C34: 35 -> 37
-- columns; scripts/check-db-contracts.mjs:EXPECTED_CLIENT_WRITES). The view
-- SELECT below is copied by script from 20261004120000 (the live text) with
-- one column appended, so the C31 membership predicate is unchanged.
--
-- Prod: apply before an app build that writes hotel_rooms (until then every
-- hotel INSERT from the new form fails with 42501), and only after the C31
-- membership batch, because the view below carries its predicate.

SET LOCAL search_path = public;

CREATE OR REPLACE FUNCTION public.hotel_rooms_valid(p jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  -- CASE (not AND) wherever a later test would raise on the wrong JSON type:
  -- SQL does not promise to evaluate AND operands left to right.
  SELECT CASE WHEN jsonb_typeof(p) <> 'array' THEN false
    ELSE jsonb_array_length(p) <= 30 AND NOT EXISTS (
      SELECT 1
      FROM jsonb_array_elements(p) AS r(v)
      WHERE NOT coalesce(
        CASE WHEN jsonb_typeof(r.v) <> 'object' THEN false
        ELSE (r.v - ARRAY['name', 'guests', 'beds', 'area_sqm', 'price', 'quantity', 'photos']) = '{}'::jsonb
          AND CASE WHEN jsonb_typeof(r.v -> 'name') = 'string'
                   THEN char_length(btrim(r.v ->> 'name')) BETWEEN 1 AND 60
                   ELSE false END
          AND CASE WHEN jsonb_typeof(r.v -> 'guests') = 'number'
                   THEN (r.v ->> 'guests')::numeric = trunc((r.v ->> 'guests')::numeric)
                    AND (r.v ->> 'guests')::numeric BETWEEN 1 AND 20
                   ELSE false END
          AND CASE WHEN jsonb_typeof(r.v -> 'price') = 'number'
                   THEN (r.v ->> 'price')::numeric > 0 AND (r.v ->> 'price')::numeric <= 100000
                   ELSE false END
          AND CASE WHEN jsonb_typeof(r.v -> 'quantity') = 'number'
                   THEN (r.v ->> 'quantity')::numeric = trunc((r.v ->> 'quantity')::numeric)
                    AND (r.v ->> 'quantity')::numeric BETWEEN 1 AND 500
                   ELSE false END
          AND CASE coalesce(jsonb_typeof(r.v -> 'beds'), 'null')
                   WHEN 'null' THEN true
                   WHEN 'number' THEN (r.v ->> 'beds')::numeric = trunc((r.v ->> 'beds')::numeric)
                    AND (r.v ->> 'beds')::numeric BETWEEN 1 AND 20
                   ELSE false END
          AND CASE coalesce(jsonb_typeof(r.v -> 'area_sqm'), 'null')
                   WHEN 'null' THEN true
                   WHEN 'number' THEN (r.v ->> 'area_sqm')::numeric > 0 AND (r.v ->> 'area_sqm')::numeric <= 1000
                   ELSE false END
          AND CASE coalesce(jsonb_typeof(r.v -> 'photos'), 'null')
                   WHEN 'null' THEN true
                   WHEN 'array' THEN jsonb_array_length(r.v -> 'photos') <= 5
                    AND NOT EXISTS (
                      SELECT 1
                      FROM jsonb_array_elements(r.v -> 'photos') AS f(u)
                      WHERE jsonb_typeof(f.u) <> 'string'
                         OR (f.u #>> '{}') LIKE 'data:%'
                         OR (f.u #>> '{}') LIKE 'blob:%'
                         OR char_length(f.u #>> '{}') > 2048
                    )
                   ELSE false END
        END,
        false)
    )
  END;
$$;

-- Every role that writes properties evaluates the CHECK (as
-- photos_are_storage_urls); anon writes no properties (C34).
REVOKE ALL ON FUNCTION public.hotel_rooms_valid(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hotel_rooms_valid(jsonb) TO authenticated, service_role;

ALTER TABLE public.properties
  ADD COLUMN hotel_rooms jsonb NOT NULL DEFAULT '[]'::jsonb
  CONSTRAINT properties_hotel_rooms_valid CHECK (public.hotel_rooms_valid(hotel_rooms));

COMMENT ON COLUMN public.properties.hotel_rooms IS
  'Hotel room types (C45): [{name, guests, beds, area_sqm, price, quantity, photos}], shape checked by hotel_rooms_valid().';

GRANT INSERT (hotel_stars, hotel_rooms) ON public.properties TO authenticated;

-- C14: hotel_rooms is reviewable in both gate copies.
DO $patch$
DECLARE
  v_fn regprocedure;
  v_def text;
  v_anchor constant text := '''construction_image_url''';
BEGIN
  FOREACH v_fn IN ARRAY ARRAY[
    'public.prevent_unreviewed_public_content_update()'::regprocedure,
    'public.approve_content_change_request(uuid, uuid)'::regprocedure
  ] LOOP
    v_def := pg_get_functiondef(v_fn);
    IF position('''hotel_rooms''' IN v_def) > 0 THEN
      CONTINUE;
    END IF;
    IF (length(v_def) - length(replace(v_def, v_anchor, ''))) / length(v_anchor) <> 1 THEN
      RAISE EXCEPTION '%: expected exactly one % in the live body', v_fn, v_anchor
        USING ERRCODE = '55000';
    END IF;
    EXECUTE replace(v_def, v_anchor, v_anchor || ',''hotel_rooms''');
  END LOOP;
END
$patch$;

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
          WHERE ((ov.property_id = pr.id) AND (ov.status = 'approved'::text) AND (ov.owner_id = pr.owner_id)))) AS ownership_verified,
    pr.hotel_rooms
   FROM ((properties pr
     LEFT JOIN profiles p ON ((p.id = pr.owner_id)))
     LEFT JOIN organizations o ON (((o.id = pr.organization_id) AND (o.status = 'active'::text))))
  WHERE ((pr.status = 'active'::listing_status) AND ((pr.organization_id IS NULL) OR (o.id IS NOT NULL))
    AND (COALESCE(pr.is_for_sale, false) OR (EXISTS ( SELECT 1
           FROM public.user_subscriptions s
          WHERE ((s.user_id = pr.owner_id) AND (s.status = 'active'::text) AND (s.starts_at <= now()) AND (s.expires_at > now()))))));

NOTIFY pgrst, 'reload schema';
