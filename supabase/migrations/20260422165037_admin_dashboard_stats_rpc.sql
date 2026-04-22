create or replace function public.admin_dashboard_stats()
returns table (
  active_listings bigint,
  total_properties bigint,
  total_bookings bigint,
  completed_bookings bigint,
  active_or_completed_bookings bigint,
  total_revenue numeric,
  average_response_minutes numeric,
  average_booking_price numeric
)
language sql
stable
as $$
  with property_stats as (
    select
      count(*) filter (where status = 'active') as active_listings,
      count(*) as total_properties
    from public.properties
  ),
  booking_stats as (
    select
      count(*) as total_bookings,
      count(*) filter (where status = 'completed') as completed_bookings,
      count(*) filter (where status in ('confirmed', 'completed')) as active_or_completed_bookings,
      coalesce(sum(total_price) filter (where status = 'completed'), 0)::numeric as total_revenue,
      coalesce(avg(total_price), 0)::numeric as average_booking_price
    from public.bookings
  ),
  profile_stats as (
    select
      coalesce(avg(response_time_minutes), 0)::numeric as average_response_minutes
    from public.profiles
    where response_time_minutes is not null
  )
  select
    property_stats.active_listings,
    property_stats.total_properties,
    booking_stats.total_bookings,
    booking_stats.completed_bookings,
    booking_stats.active_or_completed_bookings,
    booking_stats.total_revenue,
    profile_stats.average_response_minutes,
    booking_stats.average_booking_price
  from property_stats, booking_stats, profile_stats;
$$;

revoke all on function public.admin_dashboard_stats() from public;
grant execute on function public.admin_dashboard_stats() to authenticated;
