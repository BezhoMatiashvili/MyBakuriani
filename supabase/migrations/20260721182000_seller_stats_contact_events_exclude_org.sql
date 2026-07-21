-- Follow-up to 20260721181000_stats_personal_scope_excludes_org.sql.
--
-- That migration excluded org-linked rows from seller_dashboard_stats'
-- personal branches for views/favorites (via the owned CTE) and leads, but
-- left the three contact_events branches (new_interest, contact_reach,
-- sms_views) on plain `ce.owner_id = me.uid`. contact_events rows carry no
-- organization_id, so reveals on the user's org-linked listings still counted
-- in personal scope — a funnel where contact_reach can exceed the (now
-- org-excluded) views_total, and the same events double-count under org scope.
--
-- Fix: personal contact_events branches additionally exclude events whose
-- property is org-linked. NOT EXISTS (rather than `ce.property_id IN owned`)
-- deliberately preserves the prior counting of events with a NULL/other
-- property_id — only events attributable to an org-linked property move to
-- the org side. owner_dashboard_stats already routes its calls metric through
-- the org-excluded owned_props CTE and needs no change.
-- Signature unchanged -> plain CREATE OR REPLACE, no client change.

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
        (p_organization_id IS NULL AND p.owner_id = me.uid AND p.organization_id IS NULL)
        OR (p_organization_id IS NOT NULL AND p.organization_id = p_organization_id)
      )
      AND (p_property_ids IS NULL OR p.id = ANY (p_property_ids))
  )
  SELECT
    (
      SELECT count(*)
      FROM public.contact_events ce, me
      WHERE (
          (p_organization_id IS NULL AND ce.owner_id = me.uid AND NOT EXISTS (
            SELECT 1 FROM public.properties op
            WHERE op.id = ce.property_id AND op.organization_id IS NOT NULL
          ))
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
      SELECT coalesce(sum(p.views_count), 0)
      FROM public.properties p
      WHERE p.id IN (SELECT id FROM owned)
    )::bigint AS views_total,
    (
      SELECT count(DISTINCT ce.visitor_id)
      FROM public.contact_events ce, me
      WHERE (
          (p_organization_id IS NULL AND ce.owner_id = me.uid AND NOT EXISTS (
            SELECT 1 FROM public.properties op
            WHERE op.id = ce.property_id AND op.organization_id IS NOT NULL
          ))
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
          (p_organization_id IS NULL AND ce.owner_id = me.uid AND NOT EXISTS (
            SELECT 1 FROM public.properties op
            WHERE op.id = ce.property_id AND op.organization_id IS NOT NULL
          ))
          OR (p_organization_id IS NOT NULL AND ce.property_id IN (SELECT id FROM owned))
        )
        AND (p_property_ids IS NULL OR ce.property_id = ANY (p_property_ids))
        AND ce.created_at >= p_from
        AND ce.created_at < p_to
    )::bigint AS sms_views;
END;
$$;
