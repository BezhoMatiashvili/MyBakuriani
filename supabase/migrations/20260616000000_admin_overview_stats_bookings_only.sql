-- Removes the smart-match contribution from the admin funnel's "Requests sent"
-- metric. requests_7d now counts bookings created in the last 7 days only;
-- smart-match requests are no longer folded in (smart match is a renter-only
-- feature and was inflating the booking funnel).
--
-- Signature is unchanged from 20260615000000_admin_overview_stats_funnel.sql, so
-- CREATE OR REPLACE is sufficient (no DROP). Unlike DROP + CREATE, CREATE OR
-- REPLACE preserves existing privileges, so the EXECUTE revokes from the prior
-- migration stay in effect -- the function remains callable only through the
-- service_role client. Non-destructive: no columns dropped, no data touched.
-- Rollback = restore the "+ smart_match_requests" addend in a follow-up migration.

create or replace function public.admin_overview_stats()
returns table (
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
  requests_7d bigint
)
language sql
security definer
set search_path = public
stable
as $$
  with revenue as (
    -- Money the platform actually earned: VIP boosts, SMS packages and
    -- membership/commission. Excludes balance top-ups (cash-in, not revenue),
    -- withdrawals and zero-amount sms_send rows.
    select coalesce(sum(abs(amount)), 0)::numeric as net_revenue
    from public.transactions
    where type in (
      'vip_boost', 'super_vip', 'discount_badge', 'sms_package', 'commission'
    )
  ),
  listings as (
    select
      (select count(*) from public.properties where status = 'active')
        + (select count(*) from public.services where status = 'active')
        as active_listings,
      (select count(*) from public.properties
        where status = 'pending' and created_at < now() - interval '24 hours')
        + (select count(*) from public.services
            where status = 'pending' and created_at < now() - interval '24 hours')
        as pending_over_24h
  ),
  visits as (
    select
      count(*) as total_visits,
      count(distinct visitor_id) as unique_visits,
      count(distinct user_id) filter (where user_id is not null)
        as registered_visitors,
      count(distinct visitor_id)
        filter (where created_at >= now() - interval '7 days')
        as weekly_visitors,
      count(*) filter (where created_at >= now() - interval '7 days')
        as visits_7d,
      -- page_views.path is stored locale-stripped ("/search", not "/ka/search")
      count(*) filter (where created_at >= now() - interval '7 days'
                         and path like '/search%')
        as searches_7d
    from public.page_views
  ),
  users as (
    select count(*) as registered_users
    from public.profiles
  ),
  requests as (
    -- Bookings only. Smart-match requests are deliberately NOT counted here:
    -- smart match is a renter-only feature and does not belong in the booking
    -- funnel.
    select
      (select count(*) from public.bookings
        where created_at >= now() - interval '7 days') as requests_7d
  )
  select
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
    requests.requests_7d
  from revenue, listings, visits, users, requests;
$$;
