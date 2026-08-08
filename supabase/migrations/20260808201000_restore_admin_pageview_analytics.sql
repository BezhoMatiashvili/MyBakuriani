-- Restores the public page-view metrics requested on the admin overview and
-- makes every funnel stage use the same rolling seven-day booking cohort.
-- The page_views table/RLS contract is unchanged: only service_role can write,
-- and this aggregate remains callable only through the server-side admin path.

drop function if exists public.admin_overview_stats();

create function public.admin_overview_stats()
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
  requests_7d bigint,
  completed_7d bigint
)
language sql
security definer
set search_path = public
stable
as $$
  with revenue as (
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
      count(*) filter (
        where created_at >= now() - interval '7 days'
          and (
            path = '/search'
            or path like '/search/%'
            or path ~ '^/(ka|en|ru)/search(/|$)'
          )
      ) as searches_7d
    from public.page_views
  ),
  users as (
    select count(*) as registered_users
    from public.profiles
  ),
  requests as (
    select
      count(*) as requests_7d,
      count(*) filter (where status = 'completed') as completed_7d
    from public.bookings
    where created_at >= now() - interval '7 days'
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
    requests.requests_7d,
    requests.completed_7d
  from revenue, listings, visits, users, requests;
$$;

revoke all on function public.admin_overview_stats() from public;
revoke all on function public.admin_overview_stats() from anon;
revoke all on function public.admin_overview_stats() from authenticated;
grant execute on function public.admin_overview_stats() to service_role;

notify pgrst, 'reload schema';
