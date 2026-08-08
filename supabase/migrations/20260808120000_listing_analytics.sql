-- Per-listing analytics for the owner dashboards (rentals + individually-owned
-- sale listings). Three real, event-backed metrics only: views, phone/WhatsApp
-- reveals, favorites. Deliberately no "impressions" metric — nothing tracks
-- listing-card impressions today, and fabricating one would violate the
-- accuracy requirement this feature exists for.

-- ---------------------------------------------------------------------------
-- New event log for detail-page views. Mirrors contact_reveal_events' security
-- posture exactly: RLS enabled, no policies, all grants revoked from
-- PUBLIC/anon/authenticated. Readable only through the SECURITY DEFINER
-- listing_analytics() RPC below, scoped to the listing's own owner.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.listing_view_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid NOT NULL,
  listing_type text NOT NULL CHECK (listing_type IN ('property','service')),
  client_ip text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS listing_view_events_listing_idx
  ON public.listing_view_events (listing_type, listing_id, created_at DESC);
ALTER TABLE public.listing_view_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.listing_view_events FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Write path. A new wrapper RPC rather than adding a parameter to the existing
-- increment_views/increment_service_views — CREATE OR REPLACE only replaces an
-- IDENTICAL signature, so adding a parameter would create a second, still-
-- resolvable overload instead of retiring the old one. The old RPCs are left
-- untouched; nothing else calls them. Bumps the counter AND logs the event in
-- one atomic call so the two can never drift.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.record_listing_view(
  p_listing_type text, p_listing_id uuid, p_client_ip text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $function$
BEGIN
  IF p_listing_type = 'property' THEN
    UPDATE public.properties SET views_count = views_count + 1
      WHERE id = p_listing_id AND status = 'active';
  ELSIF p_listing_type = 'service' THEN
    UPDATE public.services SET views_count = views_count + 1
      WHERE id = p_listing_id AND status = 'active';
  ELSE
    RAISE EXCEPTION 'invalid listing_type' USING ERRCODE = '22023';
  END IF;

  IF FOUND THEN
    INSERT INTO public.listing_view_events (listing_id, listing_type, client_ip)
    VALUES (p_listing_id, p_listing_type, COALESCE(NULLIF(btrim(p_client_ip), ''), 'unknown'));
  END IF;
END;
$function$;
REVOKE ALL ON FUNCTION public.record_listing_view(text, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_listing_view(text, uuid, text) TO service_role;

-- ---------------------------------------------------------------------------
-- Read path. Ownership-gated aggregation: current totals (views is the
-- lifetime counter; reveals/favorites are real COUNTs) plus a daily series for
-- all three, bucketed in Asia/Tbilisi so an evening event doesn't land on the
-- wrong calendar day for a Georgian audience. The views series only has real
-- data from whenever this migration ships forward -- there is no event history
-- to backfill, and it must not be fabricated.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.listing_analytics(
  p_listing_type text, p_listing_id uuid, p_days integer DEFAULT 30
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $function$
DECLARE
  v_owner uuid;
  v_days integer := LEAST(GREATEST(COALESCE(p_days, 30), 1), 90);
  v_result jsonb;
BEGIN
  IF p_listing_type = 'property' THEN
    SELECT owner_id INTO v_owner FROM public.properties WHERE id = p_listing_id;
  ELSIF p_listing_type = 'service' THEN
    SELECT owner_id INTO v_owner FROM public.services WHERE id = p_listing_id;
  ELSE
    RAISE EXCEPTION 'invalid listing_type' USING ERRCODE = '22023';
  END IF;

  IF v_owner IS NULL OR v_owner <> auth.uid() THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;

  WITH days AS (
    SELECT generate_series(
      (now() AT TIME ZONE 'Asia/Tbilisi')::date - (v_days - 1),
      (now() AT TIME ZONE 'Asia/Tbilisi')::date,
      '1 day'
    )::date AS d
  ),
  views AS (
    SELECT (created_at AT TIME ZONE 'Asia/Tbilisi')::date AS d, count(*) AS n
    FROM public.listing_view_events
    WHERE listing_type = p_listing_type AND listing_id = p_listing_id
    GROUP BY 1
  ),
  reveals AS (
    SELECT (created_at AT TIME ZONE 'Asia/Tbilisi')::date AS d, count(*) AS n
    FROM public.contact_reveal_events
    WHERE listing_type = p_listing_type AND listing_id = p_listing_id
    GROUP BY 1
  ),
  favs AS (
    SELECT (created_at AT TIME ZONE 'Asia/Tbilisi')::date AS d, count(*) AS n
    FROM public.favorites
    WHERE (p_listing_type = 'property' AND property_id = p_listing_id)
       OR (p_listing_type = 'service' AND service_id = p_listing_id)
    GROUP BY 1
  ),
  series AS (
    SELECT
      to_char(days.d, 'YYYY-MM-DD') AS date,
      COALESCE(views.n, 0) AS views,
      COALESCE(reveals.n, 0) AS reveals,
      COALESCE(favs.n, 0) AS favorites
    FROM days
    LEFT JOIN views ON views.d = days.d
    LEFT JOIN reveals ON reveals.d = days.d
    LEFT JOIN favs ON favs.d = days.d
    ORDER BY days.d
  )
  SELECT jsonb_build_object(
    'totals', jsonb_build_object(
      'views', (SELECT CASE WHEN p_listing_type = 'property'
                  THEN (SELECT views_count FROM public.properties WHERE id = p_listing_id)
                  ELSE (SELECT views_count FROM public.services WHERE id = p_listing_id) END),
      'reveals', (SELECT count(*) FROM public.contact_reveal_events
                  WHERE listing_type = p_listing_type AND listing_id = p_listing_id),
      'favorites', (SELECT count(*) FROM public.favorites
                    WHERE (p_listing_type = 'property' AND property_id = p_listing_id)
                       OR (p_listing_type = 'service' AND service_id = p_listing_id))
    ),
    'series', (SELECT jsonb_agg(to_jsonb(series)) FROM series)
  ) INTO v_result;

  RETURN v_result;
END;
$function$;
REVOKE ALL ON FUNCTION public.listing_analytics(text, uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.listing_analytics(text, uuid, integer) TO authenticated;

NOTIFY pgrst, 'reload schema';
