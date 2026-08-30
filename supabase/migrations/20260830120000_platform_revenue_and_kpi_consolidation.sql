-- Fix Areas C+D: one revenue definition (public.platform_revenue) and
-- manual_bookings-based KPIs in admin_overview_stats(). Retires
-- admin_dashboard_stats(), which computed booking-volume numbers from the
-- dead public.bookings table (nothing in src/ ever inserts into it).
--
-- See memory-bank/contracts.md C25 (added separately in this session) for the
-- durable invariant this establishes.

-- 1. One platform-revenue definition, callable with an optional window.
create function public.platform_revenue(
  p_since timestamptz default null,
  p_until timestamptz default null
)
returns table(gross numeric, net numeric)
language sql
stable
security definer
set search_path to 'public'
as $function$
  with gross_cte as (
    select coalesce(sum(abs(amount)), 0)::numeric as gross
    from public.transactions
    where type in (
      'vip_boost', 'super_vip', 'discount_badge', 'sms_package', 'commission'
    )
      and (p_since is null or created_at >= p_since)
      and (p_until is null or created_at < p_until)
  ),
  refunds_cte as (
    select coalesce(sum(abs(amount)), 0)::numeric as refunds
    from public.transactions
    where type = 'membership_refund'
      and (p_since is null or created_at >= p_since)
      and (p_until is null or created_at < p_until)
  )
  select gross_cte.gross, gross_cte.gross - refunds_cte.refunds
  from gross_cte, refunds_cte;
$function$;

revoke all on function public.platform_revenue(timestamptz, timestamptz) from public;
revoke all on function public.platform_revenue(timestamptz, timestamptz) from anon;
revoke all on function public.platform_revenue(timestamptz, timestamptz) from authenticated;
grant execute on function public.platform_revenue(timestamptz, timestamptz) to service_role;

-- 2. admin_overview_stats(): recreate with the new column list (Postgres
-- requires drop+create when RETURNS TABLE's column list changes). Booking
-- KPIs now read public.manual_bookings instead of the dead public.bookings.
-- Revenue now comes from platform_revenue() instead of an inline CASE.
drop function public.admin_overview_stats();

create function public.admin_overview_stats()
returns table(
  net_revenue numeric,
  gross_revenue numeric,
  active_listings bigint,
  pending_over_24h bigint,
  total_visits bigint,
  unique_visits bigint,
  registered_visitors bigint,
  registered_users bigint,
  weekly_visitors bigint,
  visits_7d bigint,
  searches_7d bigint,
  bookings_7d bigint,
  stays_completed_7d bigint,
  occupancy_rate_pct numeric,
  average_nightly_price numeric
)
language sql
stable
security definer
set search_path to 'public'
as $function$
  with revenue as (
    select gross, net from public.platform_revenue(null, null)
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
  active_rentals as (
    select count(*) as n
    from public.properties
    where status = 'active' and coalesce(is_for_sale, false) = false
  ),
  bookings_window as (
    select
      count(*) filter (
        where status <> 'cancelled' and created_at >= now() - interval '7 days'
      ) as bookings_7d,
      count(*) filter (
        where status <> 'cancelled'
          and check_out >= now() - interval '7 days'
          and check_out < now()
      ) as stays_completed_7d
    from public.manual_bookings
  ),
  occupancy as (
    select
      coalesce(sum(
        least(check_out, (current_date + 30)) - greatest(check_in, current_date)
      ), 0)::numeric as nights_booked
    from public.manual_bookings
    where status <> 'cancelled'
      and check_in < (current_date + 30)
      and check_out > current_date
  ),
  pricing as (
    select avg(amount / nullif(check_out - check_in, 0))::numeric
      as average_nightly_price
    from public.manual_bookings
    where status <> 'cancelled' and amount is not null
  )
  select
    revenue.net,
    revenue.gross,
    listings.active_listings,
    listings.pending_over_24h,
    visits.total_visits,
    visits.unique_visits,
    visits.registered_visitors,
    users.registered_users,
    visits.weekly_visitors,
    visits.visits_7d,
    visits.searches_7d,
    bookings_window.bookings_7d,
    bookings_window.stays_completed_7d,
    case when active_rentals.n > 0
      then round((occupancy.nights_booked / (active_rentals.n * 30.0)) * 100, 2)
      else 0
    end as occupancy_rate_pct,
    coalesce(pricing.average_nightly_price, 0) as average_nightly_price
  from revenue, listings, visits, users, active_rentals, bookings_window,
    occupancy, pricing;
$function$;

revoke all on function public.admin_overview_stats() from public;
revoke all on function public.admin_overview_stats() from anon;
revoke all on function public.admin_overview_stats() from authenticated;
grant execute on function public.admin_overview_stats() to service_role;

-- 3. admin_dashboard_stats() is retired: its only caller
-- (src/lib/admin/getAdminStats.ts) is updated in the same change to call
-- admin_overview_stats() alone, and every field it uniquely provided was
-- either dead-table-derived (total_bookings, completed_bookings,
-- active_or_completed_bookings, total_revenue, average_booking_price) or
-- unrendered (average_response_minutes, total_properties).
drop function public.admin_dashboard_stats();

notify pgrst, 'reload schema';
