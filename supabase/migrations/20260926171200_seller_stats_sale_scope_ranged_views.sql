-- Seller analytics funnel consistency (C22). The only caller is
-- dashboard/seller/analytics/page.tsx, which always passes a date range.
--  * [sale-scope] `owned` was every personal property and the personal-scope
--    contact metrics were any non-org contact of the owner, so rental
--    activity leaked into the sale funnel (31 lifetime views vs 6 on sales).
--  * [ranged-views] views_total ignored p_from/p_to while every other metric
--    is range-bounded; it now counts listing_view_events in the range.
-- Body regenerated from the live definition; tagged lines are the changes.
-- CREATE OR REPLACE keeps the existing EXECUTE grant.

CREATE OR REPLACE FUNCTION public.seller_dashboard_stats(p_from timestamp with time zone, p_to timestamp with time zone, p_property_ids uuid[] DEFAULT NULL::uuid[], p_organization_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(new_interest bigint, new_leads bigint, sold bigint, favorites bigint, views_total bigint, contact_reach bigint, sms_views bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
        (p_organization_id IS NULL AND p.owner_id = me.uid AND p.organization_id IS NULL)
        OR (p_organization_id IS NOT NULL AND p.organization_id = p_organization_id)
      )
      -- [sale-scope] seller analytics covers sale listings; rentals have their own dashboard.
      AND coalesce(p.is_for_sale, false)
      AND (p_property_ids IS NULL OR p.id = ANY (p_property_ids))
  )
  SELECT
    (
      SELECT count(*)
      FROM public.contact_events ce, me
      WHERE (
          -- [sale-scope] personal scope = the caller's own sale listings only
          -- (owned already excludes org-linked ones).
          (p_organization_id IS NULL AND ce.owner_id = me.uid
            AND ce.property_id IN (SELECT id FROM owned))
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
          (p_organization_id IS NULL AND l.owner_id = me.uid AND l.organization_id IS NULL)
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
          (p_organization_id IS NULL AND l.owner_id = me.uid AND l.organization_id IS NULL)
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
      -- [ranged-views] views inside [p_from, p_to) come from the event log
      -- (which starts 2026-08-08, no backfill); the lifetime counter only when
      -- no bound is given at all.
      CASE
        WHEN p_from IS NULL AND p_to IS NULL THEN (
          SELECT coalesce(sum(p.views_count), 0)
          FROM public.properties p
          WHERE p.id IN (SELECT id FROM owned)
        )
        ELSE (
          SELECT count(*)
          FROM public.listing_view_events e
          WHERE e.listing_type = 'property'
            AND e.listing_id IN (SELECT id FROM owned)
            AND (p_from IS NULL OR e.created_at >= p_from)
            AND (p_to IS NULL OR e.created_at < p_to)
        )
      END
    )::bigint AS views_total,
    (
      SELECT count(DISTINCT ce.visitor_id)
      FROM public.contact_events ce, me
      WHERE (
          -- [sale-scope] personal scope = the caller's own sale listings only
          -- (owned already excludes org-linked ones).
          (p_organization_id IS NULL AND ce.owner_id = me.uid
            AND ce.property_id IN (SELECT id FROM owned))
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
          -- [sale-scope] personal scope = the caller's own sale listings only
          -- (owned already excludes org-linked ones).
          (p_organization_id IS NULL AND ce.owner_id = me.uid
            AND ce.property_id IN (SELECT id FROM owned))
          OR (p_organization_id IS NOT NULL AND ce.property_id IN (SELECT id FROM owned))
        )
        AND (p_property_ids IS NULL OR ce.property_id = ANY (p_property_ids))
        AND ce.created_at >= p_from
        AND ce.created_at < p_to
    )::bigint AS sms_views;
END;
$function$
;
