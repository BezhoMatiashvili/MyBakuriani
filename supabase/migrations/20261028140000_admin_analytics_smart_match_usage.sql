-- Smart Match usage on the admin analytics page (C49). Body = 20261006240000 (= live staging,
-- 2026-10-28) plus four keys:
--   guests: distinct guests behind `requests`, under the same consent filter;
--   owners / offers_sent: offers created in the period, any status (withdrawn = 'cancelled'
--     included), and their distinct renters. Offers carry no analytics event, so these are never
--     filtered;
--   requests_all_time: every stored request, with no period and no filter.
-- Additive (the old app ignores the new keys); apply before the app. The guard refuses (55000)
-- where the live body differs from the 20261006240000 one.

do $guard$
declare
  v_live text := (select md5(p.prosrc) from pg_proc p
                  where p.oid = to_regprocedure('public.admin_analytics_smart_match(date, date, text, text, text, text, text)'));
begin
  if v_live is distinct from '4d2fdff7bf65f0a0d42d137b30557337' then
    raise exception 'admin_analytics_smart_match_usage: public.admin_analytics_smart_match() differs from the reviewed body (md5 %); regenerate this migration from the live definition', v_live
      using errcode = '55000';
  end if;
end
$guard$;

create or replace function public.admin_analytics_smart_match(
  p_from date,
  p_to date,
  p_device text default null,
  p_country text default null,
  p_city text default null,
  p_source text default null,
  p_page_type text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_t0 timestamptz;
  v_t1 timestamptz;
  v_filtered boolean;
  v_result jsonb;
begin
  perform public.analytics_check_range(p_from, p_to);
  perform public.analytics_check_dims(p_device, p_country, p_city, p_source, p_page_type);
  v_t0 := p_from::timestamp at time zone 'Asia/Tbilisi';
  v_t1 := (p_to + 1)::timestamp at time zone 'Asia/Tbilisi';
  v_filtered := coalesce(p_device, p_country, p_city, p_source, p_page_type) is not null;

  with req as (
    select r.id, r.guest_id
    from public.smart_match_requests r
    where r.created_at >= v_t0
      and r.created_at < v_t1
      and (
        not v_filtered
        or exists (
          select 1
          from public.analytics_events e
          where e.name = 'smart_match_request'
            and e.entity_id = r.id
            and (p_device is null or e.device = p_device)
            and (p_country is null or e.country = p_country)
            and (p_city is null or e.city = p_city)
            and (p_source is null or e.source = p_source)
            and (p_page_type is null or e.page_type = p_page_type)
        )
      )
  ),
  offers as (
    select o.request_id, o.property_id, o.created_at, req.guest_id
    from public.smart_match_offers o
    join req on req.id = o.request_id
    where o.status <> 'cancelled'
  ),
  leads as (
    select distinct o.request_id, o.property_id
    from offers o
    where exists (
        select 1 from public.contact_reveal_events c
        where c.account_id = o.guest_id
          and c.listing_id = o.property_id
          and c.created_at >= o.created_at
      )
      or exists (
        select 1 from public.contact_events ce
        where ce.visitor_id = o.guest_id
          and ce.property_id = o.property_id
          and ce.created_at >= o.created_at
      )
  ),
  sent as (
    select o.renter_id
    from public.smart_match_offers o
    where o.created_at >= v_t0
      and o.created_at < v_t1
  )
  select jsonb_build_object(
    'filtered', v_filtered,
    'requests', (select count(*) from req),
    'requests_with_offer', (select count(distinct o.request_id) from offers o),
    'match_rate', (
      select round(
        (select count(distinct o.request_id) from offers o)::numeric
          / nullif((select count(*) from req), 0),
        4
      )
    ),
    'matching_listings', (select count(distinct o.property_id) from offers o),
    'responses', (select count(*) from offers),
    'leads', (select count(*) from leads),
    'guests', (select count(distinct r.guest_id) from req r),
    'owners', (select count(distinct s.renter_id) from sent s),
    'offers_sent', (select count(*) from sent),
    'requests_all_time', (select count(*) from public.smart_match_requests)
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public.admin_analytics_smart_match(date, date, text, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.admin_analytics_smart_match(date, date, text, text, text, text, text)
  to service_role;
