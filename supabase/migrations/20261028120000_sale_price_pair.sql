-- 20261028120000_sale_price_pair.sql
--
-- Sale prices typed in lari or dollars, both stored (contract C54). A seller
-- may type a sale price in GEL or USD (the sale form's currency chip). The
-- typed amount is stored exactly; the other one is converted once, at the
-- National Bank of Georgia rate the form showed, in whole units:
--
--   sale_price           numeric(12,2), still US dollars: the only number that
--                        sorting, the sale filters, Baku's search_sale budget,
--                        the zone averages and the price-drop trigger read.
--   sale_price_gel       numeric(12,2), the lari amount. NULL on every row
--                        written before this (no backfill: those convert live).
--   sale_price_currency  'USD' (default) | 'GEL': the currency the seller
--                        typed, shown by default. Read only by
--                        src/lib/currency/money.ts:salePrice.
--
-- CHECKs: the currency list (its own constraint, so check-db-contracts can
-- compare it with CURRENCY_CODES), lari > 0, 'GEL' needs lari, lari needs
-- dollars, and lari between 1.5 and 4.5 times the dollars (money.ts:
-- SALE_PAIR_BAND). The band is a sanity check, not a rate: it stops a crafted
-- insert or proposal from pairing a tiny dollar figure (what the filters read)
-- with the real lari figure (what visitors see).
--
-- authenticated gains INSERT on both columns (C34: 37 -> 39 columns,
-- scripts/check-db-contracts.mjs:EXPECTED_CLIENT_WRITES), no UPDATE: an edit
-- goes through the review gate (C14). The trigger below makes a changed dollar
-- price with unchanged lari a dollar listing (an admin's dollar edit, or a
-- proposal naming sale_price alone), instead of keeping a lari price that no
-- longer matches. It fires after the C14 gate, the field lock and the rental
-- gate (BEFORE triggers run in name order) and relies on
-- approve_content_change_request applying a request in ONE UPDATE.
--
-- Both C14 arrays gain the two columns, patched from their LIVE text (one
-- 'hotel_rooms' anchor each, refused otherwise), never retyped; CREATE OR
-- REPLACE keeps their owner, ACL and SECURITY mode. The public_properties
-- SELECT below is copied by script from 20261006100000 with the two columns
-- appended after hotel_rooms (62 columns): the C31 predicate, the reloptions
-- and the C39/C45 columns are unchanged, and the view keeps its grants.
--
-- Prod: apply after 20261006100000 and before the app build that writes the
-- pair (until then that build's sale INSERT fails with 42501). The guard
-- refuses (55000) a public_properties that is not 20261006100000's.

SET LOCAL search_path = public;

DO $guard$
DECLARE
  v_cols text[];
BEGIN
  SELECT array_agg(a.attname::text ORDER BY a.attnum) INTO v_cols
  FROM pg_catalog.pg_attribute a
  WHERE a.attrelid = 'public.public_properties'::regclass
    AND a.attnum > 0 AND NOT a.attisdropped;
  IF coalesce(array_length(v_cols, 1), 0) <> 60
     OR v_cols[59] IS DISTINCT FROM 'ownership_verified'
     OR v_cols[60] IS DISTINCT FROM 'hotel_rooms' THEN
    RAISE EXCEPTION 'public_properties is not the 20261006100000 view (% columns, last %)',
      coalesce(array_length(v_cols, 1), 0), v_cols[array_length(v_cols, 1)]
      USING ERRCODE = '55000';
  END IF;
END
$guard$;

ALTER TABLE public.properties
  ADD COLUMN sale_price_gel numeric(12,2),
  ADD COLUMN sale_price_currency text NOT NULL DEFAULT 'USD',
  ADD CONSTRAINT properties_sale_price_currency_check
    CHECK (sale_price_currency IN ('USD', 'GEL')),
  ADD CONSTRAINT properties_sale_price_gel_positive
    CHECK (sale_price_gel > 0),
  ADD CONSTRAINT properties_sale_price_gel_when_typed
    CHECK (sale_price_currency <> 'GEL' OR sale_price_gel IS NOT NULL),
  ADD CONSTRAINT properties_sale_price_gel_needs_usd
    CHECK (sale_price_gel IS NULL OR sale_price IS NOT NULL),
  ADD CONSTRAINT properties_sale_price_pair_plausible
    CHECK (sale_price_gel IS NULL OR sale_price_gel BETWEEN 1.5 * sale_price AND 4.5 * sale_price);

COMMENT ON COLUMN public.properties.sale_price_gel IS
  'Sale price in lari (C54): typed by the seller, or converted once at the NBG rate the sale form showed. NULL = dollars only.';
COMMENT ON COLUMN public.properties.sale_price_currency IS
  'The currency the seller typed the sale price in (C54): USD or GEL. Read only by money.ts:salePrice.';

GRANT INSERT (sale_price_gel, sale_price_currency) ON public.properties TO authenticated;

CREATE OR REPLACE FUNCTION public.properties_sale_price_pair()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.sale_price_gel := NULL;
  NEW.sale_price_currency := 'USD';
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.properties_sale_price_pair() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER properties_sale_price_pair
  BEFORE UPDATE OF sale_price ON public.properties
  FOR EACH ROW
  WHEN (NEW.sale_price IS DISTINCT FROM OLD.sale_price AND OLD.sale_price_gel IS NOT NULL AND NEW.sale_price_gel IS NOT DISTINCT FROM OLD.sale_price_gel)
  EXECUTE FUNCTION public.properties_sale_price_pair();

-- C14: the pair is reviewable in both gate copies, right after hotel_rooms.
DO $patch$
DECLARE
  v_fn regprocedure;
  v_def text;
  v_anchor constant text := '''hotel_rooms''';
BEGIN
  FOREACH v_fn IN ARRAY ARRAY[
    'public.prevent_unreviewed_public_content_update()'::regprocedure,
    'public.approve_content_change_request(uuid, uuid)'::regprocedure
  ] LOOP
    v_def := pg_get_functiondef(v_fn);
    IF position('''sale_price_gel''' IN v_def) > 0 THEN
      CONTINUE;
    END IF;
    IF (length(v_def) - length(replace(v_def, v_anchor, ''))) / length(v_anchor) <> 1 THEN
      RAISE EXCEPTION '%: expected exactly one % in the live body', v_fn, v_anchor
        USING ERRCODE = '55000';
    END IF;
    EXECUTE replace(v_def, v_anchor, v_anchor || ',''sale_price_gel'',''sale_price_currency''');
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
    pr.hotel_rooms,
    pr.sale_price_gel,
    pr.sale_price_currency
   FROM ((properties pr
     LEFT JOIN profiles p ON ((p.id = pr.owner_id)))
     LEFT JOIN organizations o ON (((o.id = pr.organization_id) AND (o.status = 'active'::text))))
  WHERE ((pr.status = 'active'::listing_status) AND ((pr.organization_id IS NULL) OR (o.id IS NOT NULL))
    AND (COALESCE(pr.is_for_sale, false) OR (EXISTS ( SELECT 1
           FROM public.user_subscriptions s
          WHERE ((s.user_id = pr.owner_id) AND (s.status = 'active'::text) AND (s.starts_at <= now()) AND (s.expires_at > now()))))));

NOTIFY pgrst, 'reload schema';
