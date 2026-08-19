-- Rejected memberships are fully refunded, so they must reverse the original
-- commission in the admin overview instead of remaining reported as revenue.
CREATE OR REPLACE FUNCTION public.admin_overview_stats()
RETURNS TABLE (
  net_revenue numeric,
  active_listings bigint,
  pending_over_24h bigint,
  total_visits bigint,
  unique_visits bigint,
  registered_visitors bigint,
  registered_users bigint,
  weekly_visitors bigint,
  visits_7d bigint,
  searches_7d bigint,
  requests_7d bigint,
  completed_7d bigint
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  WITH revenue AS (
    SELECT coalesce(sum(
      CASE
        WHEN type = 'membership_refund' THEN -abs(amount)
        ELSE abs(amount)
      END
    ), 0)::numeric AS net_revenue
    FROM public.transactions
    WHERE type IN (
      'vip_boost', 'super_vip', 'discount_badge', 'sms_package', 'commission',
      'membership_refund'
    )
  ),
  listings AS (
    SELECT
      (SELECT count(*) FROM public.properties WHERE status = 'active')
        + (SELECT count(*) FROM public.services WHERE status = 'active')
        AS active_listings,
      (SELECT count(*) FROM public.properties
        WHERE status = 'pending' AND created_at < now() - interval '24 hours')
        + (SELECT count(*) FROM public.services
            WHERE status = 'pending' AND created_at < now() - interval '24 hours')
        AS pending_over_24h
  ),
  visits AS (
    SELECT
      count(*) AS total_visits,
      count(DISTINCT visitor_id) AS unique_visits,
      count(DISTINCT user_id) FILTER (WHERE user_id IS NOT NULL)
        AS registered_visitors,
      count(DISTINCT visitor_id)
        FILTER (WHERE created_at >= now() - interval '7 days')
        AS weekly_visitors,
      count(*) FILTER (WHERE created_at >= now() - interval '7 days')
        AS visits_7d,
      count(*) FILTER (
        WHERE created_at >= now() - interval '7 days'
          AND (
            path = '/search'
            OR path LIKE '/search/%'
            OR path ~ '^/(ka|en|ru)/search(/|$)'
          )
      ) AS searches_7d
    FROM public.page_views
  ),
  users AS (
    SELECT count(*) AS registered_users
    FROM public.profiles
  ),
  requests AS (
    SELECT
      count(*) AS requests_7d,
      count(*) FILTER (WHERE status = 'completed') AS completed_7d
    FROM public.bookings
    WHERE created_at >= now() - interval '7 days'
  )
  SELECT
    revenue.net_revenue,
    listings.active_listings,
    listings.pending_over_24h,
    visits.total_visits,
    visits.unique_visits,
    visits.registered_visitors,
    users.registered_users,
    visits.weekly_visitors,
    visits.visits_7d,
    visits.searches_7d,
    requests.requests_7d,
    requests.completed_7d
  FROM revenue, listings, visits, users, requests;
$$;

REVOKE ALL ON FUNCTION public.admin_overview_stats()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_overview_stats() TO service_role;

NOTIFY pgrst, 'reload schema';
