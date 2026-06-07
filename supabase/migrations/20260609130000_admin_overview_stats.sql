-- Admin overview aggregates that must read across ALL users' rows (platform
-- revenue, every listing, every visit). SECURITY DEFINER so it bypasses RLS, but
-- execution is revoked from public/anon/authenticated — it is only ever called
-- from the admin stats API route via the service_role client (which bypasses
-- grants). This keeps platform-wide revenue out of reach of ordinary users,
-- unlike the broadly-granted admin_dashboard_stats().

create or replace function public.admin_overview_stats()
returns table (
  net_revenue numeric,
  active_listings bigint,
  pending_over_24h bigint,
  total_visits bigint,
  unique_visits bigint,
  registered_visitors bigint
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
        as registered_visitors
    from public.page_views
  )
  select
    revenue.net_revenue,
    listings.active_listings,
    listings.pending_over_24h,
    visits.total_visits,
    visits.unique_visits,
    visits.registered_visitors
  from revenue, listings, visits;
$$;

revoke all on function public.admin_overview_stats() from public;
revoke all on function public.admin_overview_stats() from anon;
revoke all on function public.admin_overview_stats() from authenticated;
