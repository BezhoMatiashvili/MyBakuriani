-- Adds an optional p_organization_id to both dashboard-stats RPCs so an
-- approved company member can view the COMPANY's aggregated numbers instead
-- of only their own. Default NULL preserves today's per-user behavior
-- byte-for-byte (verified line-by-line against the current function bodies).
--
-- DEPENDS ON 20260628160000_leads_organization_id.sql (leads.organization_id).
-- plpgsql binds embedded-query columns lazily — on first EXECUTION, not at
-- CREATE FUNCTION — so if that migration were skipped, this one would apply
-- cleanly and then every seller_dashboard_stats call (including plain personal
-- calls) would fail at runtime with "column l.organization_id does not exist",
-- with the old function already dropped. The guard below turns that silent
-- runtime breakage into a loud apply-time failure instead.
--
-- IMPORTANT Postgres nuance: CREATE OR REPLACE FUNCTION cannot widen an
-- existing signature in place when the parameter LIST changes — Postgres
-- treats "(timestamptz, timestamptz, uuid[])" and
-- "(timestamptz, timestamptz, uuid[], uuid)" as two DIFFERENT overloads (the
-- DEFAULT NULL doesn't matter for overload identity), so simply doing
-- CREATE OR REPLACE with an added parameter creates a SECOND function next to
-- the old one instead of replacing it — callers passing only 3 args would
-- keep hitting the unmodified old version. You MUST DROP the old-signature
-- function first, then CREATE the new one.
--
-- `spent` intentionally stays personal (t.user_id = me.uid, untouched) in
-- owner_dashboard_stats — transactions are wallet-level per the function's
-- own existing comment ("spent is wallet-level... same value shows on every
-- cabinet"), there is no company-wallet concept in this schema. Do not scope
-- it by organization. Services likewise stay personal in org mode: services
-- have no organization_id column, so they are not derivable from org ownership.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'leads'
      AND column_name = 'organization_id'
  ) THEN
    RAISE EXCEPTION 'public.leads.organization_id is missing — apply 20260628160000_leads_organization_id.sql before this migration';
  END IF;
END $$;

DROP FUNCTION IF EXISTS public.seller_dashboard_stats(timestamptz, timestamptz, uuid[]);

CREATE OR REPLACE FUNCTION public.seller_dashboard_stats(
  p_from timestamptz,
  p_to timestamptz,
  p_property_ids uuid[] DEFAULT NULL,
  p_organization_id uuid DEFAULT NULL
)
RETURNS TABLE (
  new_interest bigint,
  new_leads bigint,
  sold bigint,
  favorites bigint,
  views_total bigint,
  contact_reach bigint,
  sms_views bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
BEGIN
  IF p_organization_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.organization_members m
    WHERE m.organization_id = p_organization_id
      AND m.user_id = auth.uid()
      AND m.status = 'approved'
  ) THEN
    RAISE EXCEPTION 'თქვენ არ ხართ ამ კომპანიის დადასტურებული წევრი' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH me AS (
    SELECT auth.uid() AS uid
  ),
  owned AS (
    SELECT p.id
    FROM public.properties p, me
    WHERE (
        (p_organization_id IS NULL AND p.owner_id = me.uid)
        OR (p_organization_id IS NOT NULL AND p.organization_id = p_organization_id)
      )
      AND (p_property_ids IS NULL OR p.id = ANY (p_property_ids))
  )
  SELECT
    (
      SELECT count(*)
      FROM public.contact_events ce, me
      WHERE (
          (p_organization_id IS NULL AND ce.owner_id = me.uid)
          OR (p_organization_id IS NOT NULL AND ce.property_id IN (SELECT id FROM owned))
        )
        AND (p_property_ids IS NULL OR ce.property_id = ANY (p_property_ids))
        AND ce.created_at >= p_from
        AND ce.created_at < p_to
    )::bigint AS new_interest,
    (
      SELECT count(*)
      FROM public.leads l, me
      WHERE (
          (p_organization_id IS NULL AND l.owner_id = me.uid)
          OR (p_organization_id IS NOT NULL AND l.organization_id = p_organization_id)
        )
        AND (p_property_ids IS NULL OR l.property_id = ANY (p_property_ids))
        AND l.created_at >= p_from
        AND l.created_at < p_to
    )::bigint AS new_leads,
    (
      SELECT count(*)
      FROM public.leads l, me
      WHERE (
          (p_organization_id IS NULL AND l.owner_id = me.uid)
          OR (p_organization_id IS NOT NULL AND l.organization_id = p_organization_id)
        )
        AND l.stage = 'closed'
        AND (p_property_ids IS NULL OR l.property_id = ANY (p_property_ids))
        AND l.created_at >= p_from
        AND l.created_at < p_to
    )::bigint AS sold,
    (
      SELECT count(*)
      FROM public.favorites f
      WHERE f.property_id IN (SELECT id FROM owned)
        AND f.created_at >= p_from
        AND f.created_at < p_to
    )::bigint AS favorites,
    (
      SELECT coalesce(sum(p.views_count), 0)
      FROM public.properties p
      WHERE p.id IN (SELECT id FROM owned)
    )::bigint AS views_total,
    (
      SELECT count(DISTINCT ce.visitor_id)
      FROM public.contact_events ce, me
      WHERE (
          (p_organization_id IS NULL AND ce.owner_id = me.uid)
          OR (p_organization_id IS NOT NULL AND ce.property_id IN (SELECT id FROM owned))
        )
        AND (p_property_ids IS NULL OR ce.property_id = ANY (p_property_ids))
        AND ce.created_at >= p_from
        AND ce.created_at < p_to
    )::bigint AS contact_reach,
    (
      SELECT coalesce(sum(ce.sms_sent_count), 0)
      FROM public.contact_events ce, me
      WHERE (
          (p_organization_id IS NULL AND ce.owner_id = me.uid)
          OR (p_organization_id IS NOT NULL AND ce.property_id IN (SELECT id FROM owned))
        )
        AND (p_property_ids IS NULL OR ce.property_id = ANY (p_property_ids))
        AND ce.created_at >= p_from
        AND ce.created_at < p_to
    )::bigint AS sms_views;
END;
$$;

REVOKE ALL ON FUNCTION public.seller_dashboard_stats(timestamptz, timestamptz, uuid[], uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.seller_dashboard_stats(timestamptz, timestamptz, uuid[], uuid) TO authenticated;

DROP FUNCTION IF EXISTS public.owner_dashboard_stats(text, timestamptz, timestamptz, uuid[]);

CREATE OR REPLACE FUNCTION public.owner_dashboard_stats(
  p_scope text,
  p_from timestamptz DEFAULT NULL,
  p_to timestamptz DEFAULT NULL,
  p_listing_ids uuid[] DEFAULT NULL,
  p_organization_id uuid DEFAULT NULL
)
RETURNS TABLE (
  views_total bigint,
  menu_views_total bigint,
  calls bigint,
  favorites_total bigint,
  spent numeric,
  revenue numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
BEGIN
  IF p_organization_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.organization_members m
    WHERE m.organization_id = p_organization_id
      AND m.user_id = auth.uid()
      AND m.status = 'approved'
  ) THEN
    RAISE EXCEPTION 'თქვენ არ ხართ ამ კომპანიის დადასტურებული წევრი' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH me AS (
    SELECT auth.uid() AS uid
  ),
  owned_props AS (
    SELECT p.id, p.price_per_night
    FROM public.properties p, me
    WHERE p_scope IN ('rental', 'sale')
      AND coalesce(p.is_for_sale, false) = (p_scope = 'sale')
      AND (
        (p_organization_id IS NULL AND p.owner_id = me.uid)
        OR (p_organization_id IS NOT NULL AND p.organization_id = p_organization_id)
      )
      AND (p_listing_ids IS NULL OR p.id = ANY (p_listing_ids))
  ),
  owned_svcs AS (
    SELECT s.id
    FROM public.services s, me
    WHERE s.owner_id = me.uid
      AND (
        (p_scope = 'food' AND s.category = 'food')
        OR (p_scope = 'service' AND s.category NOT IN ('food', 'cleaning'))
      )
      AND (p_listing_ids IS NULL OR s.id = ANY (p_listing_ids))
  )
  SELECT
    (
      (
        SELECT coalesce(sum(p.views_count), 0)
        FROM public.properties p
        WHERE p.id IN (SELECT id FROM owned_props)
      ) + (
        SELECT coalesce(sum(s.views_count), 0)
        FROM public.services s
        WHERE s.id IN (SELECT id FROM owned_svcs)
      )
    )::bigint AS views_total,
    (
      SELECT coalesce(sum(s.menu_views_count), 0)
      FROM public.services s
      WHERE p_scope = 'food'
        AND s.id IN (SELECT id FROM owned_svcs)
    )::bigint AS menu_views_total,
    (
      SELECT count(*)
      FROM public.contact_events ce, me
      WHERE (
          (p_organization_id IS NULL AND ce.owner_id = me.uid AND (
            ce.property_id IN (SELECT id FROM owned_props)
            OR ce.service_id IN (SELECT id FROM owned_svcs)
          ))
          OR (p_organization_id IS NOT NULL AND ce.property_id IN (SELECT id FROM owned_props))
        )
        AND (p_from IS NULL OR ce.created_at >= p_from)
        AND (p_to IS NULL OR ce.created_at < p_to)
    )::bigint AS calls,
    (
      SELECT count(*)
      FROM public.favorites f
      WHERE (
          f.property_id IN (SELECT id FROM owned_props)
          OR f.service_id IN (SELECT id FROM owned_svcs)
        )
        AND (p_from IS NULL OR f.created_at >= p_from)
        AND (p_to IS NULL OR f.created_at < p_to)
    )::bigint AS favorites_total,
    (
      SELECT coalesce(abs(sum(t.amount)), 0)
      FROM public.transactions t, me
      WHERE t.user_id = me.uid
        AND p_scope IN ('rental', 'sale', 'service', 'food')
        AND t.type IN ('vip_boost', 'super_vip', 'sms_package')
        AND t.amount < 0
        AND (p_listing_ids IS NULL OR t.reference_id = ANY (p_listing_ids))
        AND (p_from IS NULL OR t.created_at >= p_from)
        AND (p_to IS NULL OR t.created_at < p_to)
    )::numeric AS spent,
    (
      SELECT coalesce(sum(coalesce(po.price, op.price_per_night, 0)), 0)
      FROM public.calendar_blocks cb
      JOIN owned_props op ON op.id = cb.property_id
      LEFT JOIN public.price_overrides po
        ON po.property_id = cb.property_id
        AND po.date = cb.date
      WHERE p_scope = 'rental'
        AND cb.status = 'booked'
        AND (p_from IS NULL OR cb.date >= p_from::date)
        AND (p_to IS NULL OR cb.date < p_to::date)
    )::numeric AS revenue;
END;
$$;

REVOKE ALL ON FUNCTION public.owner_dashboard_stats(text, timestamptz, timestamptz, uuid[], uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.owner_dashboard_stats(text, timestamptz, timestamptz, uuid[], uuid) TO authenticated;
