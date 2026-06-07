-- Extends admin_overview_stats() with two people-focused metrics for the admin
-- dashboard KPI cards:
--   registered_users  = total rows in public.profiles (everyone who registered)
--   weekly_visitors   = distinct visitor_id seen in the last 7 days (rolling)
--
-- The RETURNS TABLE signature changes, so the function must be DROPPED and
-- recreated -- Postgres rejects CREATE OR REPLACE when OUT columns change. The
-- DROP + CREATE run in this single migration transaction, so a concurrent
-- caller (the /api/admin/stats route via service_role) only blocks briefly on
-- the function lock; it never observes a missing-function window.
--
-- A fresh CREATE resets privileges (EXECUTE defaults back to PUBLIC), so EXECUTE
-- is re-revoked from public, anon AND authenticated (all three -- known gotcha):
-- SECURITY DEFINER means this must stay callable only through the service_role
-- client. Purely additive: the existing six columns are preserved verbatim and
-- admin_dashboard_stats() is untouched.

drop function if exists public.admin_overview_stats();

create or replace function public.admin_overview_stats()
returns table (
  net_revenue numeric,
  active_listings bigint,
  pending_over_24h bigint,
  total_visits bigint,
  unique_visits bigint,
  registered_visitors bigint,
  registered_users bigint,
  weekly_visitors bigint
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
        as weekly_visitors
    from public.page_views
  ),
  users as (
    select count(*) as registered_users
    from public.profiles
  )
  select
    revenue.net_revenue,
    listings.active_listings,
    listings.pending_over_24h,
    visits.total_visits,
    visits.unique_visits,
    visits.registered_visitors,
    users.registered_users,
    visits.weekly_visitors
  from revenue, listings, visits, users;
$$;

revoke all on function public.admin_overview_stats() from public;
revoke all on function public.admin_overview_stats() from anon;
revoke all on function public.admin_overview_stats() from authenticated;
