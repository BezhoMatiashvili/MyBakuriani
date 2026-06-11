-- Per-seller dashboard KPI aggregation, scoped by a date range and (optionally)
-- a subset of the seller's OWN listings.
--
-- SECURITY DEFINER because the numbers cross RLS boundaries: `favorites` is only
-- readable by the favoriting user, so an owner cannot otherwise count favorites
-- on their own property. The owner is ALWAYS derived from auth.uid() — never
-- trusted from a parameter — and p_property_ids is intersected with the caller's
-- own properties, so the function can never leak another owner's data.
--
-- Date semantics: [p_from, p_to) — p_to is an EXCLUSIVE upper bound.
-- Caveats (documented in the dashboard UI):
--   * views_total is a LIFETIME running total (properties.views_count); it
--     respects the listing filter but ignores the date range — there is no
--     per-property page-view event stream yet.
--   * contact_events auto-expire after ~30 days, so contact-based counts read 0
--     for windows older than ~30 days. leads and favorites have full history.

create or replace function public.seller_dashboard_stats(
  p_from timestamptz,
  p_to timestamptz,
  p_property_ids uuid[] default null
)
returns table (
  new_interest bigint,
  new_leads bigint,
  sold bigint,
  favorites bigint,
  views_total bigint,
  contact_reach bigint,
  sms_views bigint
)
language sql
security definer
set search_path = public
stable
as $$
  with me as (
    select auth.uid() as uid
  ),
  owned as (
    select p.id
    from public.properties p, me
    where p.owner_id = me.uid
      and (p_property_ids is null or p.id = any (p_property_ids))
  )
  select
    (
      select count(*)
      from public.contact_events ce, me
      where ce.owner_id = me.uid
        and (p_property_ids is null or ce.property_id = any (p_property_ids))
        and ce.created_at >= p_from
        and ce.created_at < p_to
    )::bigint as new_interest,
    (
      select count(*)
      from public.leads l, me
      where l.owner_id = me.uid
        and (p_property_ids is null or l.property_id = any (p_property_ids))
        and l.created_at >= p_from
        and l.created_at < p_to
    )::bigint as new_leads,
    (
      select count(*)
      from public.leads l, me
      where l.owner_id = me.uid
        and l.stage = 'closed'
        and (p_property_ids is null or l.property_id = any (p_property_ids))
        and l.created_at >= p_from
        and l.created_at < p_to
    )::bigint as sold,
    (
      select count(*)
      from public.favorites f
      where f.property_id in (select id from owned)
        and f.created_at >= p_from
        and f.created_at < p_to
    )::bigint as favorites,
    (
      select coalesce(sum(p.views_count), 0)
      from public.properties p
      where p.id in (select id from owned)
    )::bigint as views_total,
    (
      select count(distinct ce.visitor_id)
      from public.contact_events ce, me
      where ce.owner_id = me.uid
        and (p_property_ids is null or ce.property_id = any (p_property_ids))
        and ce.created_at >= p_from
        and ce.created_at < p_to
    )::bigint as contact_reach,
    (
      select coalesce(sum(ce.sms_sent_count), 0)
      from public.contact_events ce, me
      where ce.owner_id = me.uid
        and (p_property_ids is null or ce.property_id = any (p_property_ids))
        and ce.created_at >= p_from
        and ce.created_at < p_to
    )::bigint as sms_views;
$$;

revoke all on function public.seller_dashboard_stats(timestamptz, timestamptz, uuid[]) from public;
revoke all on function public.seller_dashboard_stats(timestamptz, timestamptz, uuid[]) from anon;
grant execute on function public.seller_dashboard_stats(timestamptz, timestamptz, uuid[]) to authenticated;
