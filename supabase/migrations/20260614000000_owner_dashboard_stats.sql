-- Per-owner dashboard KPI aggregation for every cabinet (renter / seller /
-- service / food), scoped by listing kind, an optional date range and
-- (optionally) a subset of the caller's OWN listings.
--
-- SECURITY DEFINER for the same reason as seller_dashboard_stats: `favorites`
-- is only readable by the favoriting user, so an owner cannot otherwise count
-- favorites on their own listings. The owner is ALWAYS derived from auth.uid()
-- — never trusted from a parameter — and p_listing_ids is intersected with the
-- caller's own listings, so the function can never leak another owner's data.
--
-- p_scope:
--   'rental'  -> properties with is_for_sale = false
--   'sale'    -> properties with is_for_sale = true
--   'service' -> services with category not in ('food', 'cleaning')
--                (cleaning has its own cabinet; mirrors the service
--                dashboard's list query)
--   'food'    -> services with category = 'food'
--
-- Date semantics: [p_from, p_to) — p_to is an EXCLUSIVE upper bound; NULL
-- bounds mean all-time.
--
-- Caveats (surfaced in the dashboard UI where relevant):
--   * views_total / menu_views_total are LIFETIME running totals
--     (views_count / menu_views_count); they respect the listing filter but
--     ignore the date range — there is no per-listing page-view event stream.
--   * calls counts contact_events by created_at and ignores expires_at;
--     contact_events carry 30-day TTL semantics (no cleanup job runs today,
--     but if one is ever enabled, all-time counts only cover surviving rows).
--   * spent is wallet-level (transactions are per-user), so the same value
--     shows on every cabinet of one user. With a listing filter active it
--     narrows via transactions.reference_id, which excludes purchases made
--     without a listing context (reference_id IS NULL).
--   * revenue is rental-only: booked calendar days priced as the date's
--     price_override, falling back to the property's nightly price — the same
--     formula as the renter calendar page. Other scopes always return 0.
--
-- seller_dashboard_stats stays for now — seller/analytics still consumes it;
-- it can be dropped once that page migrates to this function.

create or replace function public.owner_dashboard_stats(
  p_scope text,
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_listing_ids uuid[] default null
)
returns table (
  views_total bigint,
  menu_views_total bigint,
  calls bigint,
  favorites_total bigint,
  spent numeric,
  revenue numeric
)
language sql
security definer
set search_path = public
stable
as $$
  with me as (
    select auth.uid() as uid
  ),
  owned_props as (
    select p.id, p.price_per_night
    from public.properties p, me
    where p.owner_id = me.uid
      and p_scope in ('rental', 'sale')
      and coalesce(p.is_for_sale, false) = (p_scope = 'sale')
      and (p_listing_ids is null or p.id = any (p_listing_ids))
  ),
  owned_svcs as (
    select s.id
    from public.services s, me
    where s.owner_id = me.uid
      and (
        (p_scope = 'food' and s.category = 'food')
        or (p_scope = 'service' and s.category not in ('food', 'cleaning'))
      )
      and (p_listing_ids is null or s.id = any (p_listing_ids))
  )
  select
    (
      (
        select coalesce(sum(p.views_count), 0)
        from public.properties p
        where p.id in (select id from owned_props)
      ) + (
        select coalesce(sum(s.views_count), 0)
        from public.services s
        where s.id in (select id from owned_svcs)
      )
    )::bigint as views_total,
    (
      select coalesce(sum(s.menu_views_count), 0)
      from public.services s
      where p_scope = 'food'
        and s.id in (select id from owned_svcs)
    )::bigint as menu_views_total,
    (
      select count(*)
      from public.contact_events ce, me
      where ce.owner_id = me.uid
        and (
          ce.property_id in (select id from owned_props)
          or ce.service_id in (select id from owned_svcs)
        )
        and (p_from is null or ce.created_at >= p_from)
        and (p_to is null or ce.created_at < p_to)
    )::bigint as calls,
    (
      select count(*)
      from public.favorites f
      where (
          f.property_id in (select id from owned_props)
          or f.service_id in (select id from owned_svcs)
        )
        and (p_from is null or f.created_at >= p_from)
        and (p_to is null or f.created_at < p_to)
    )::bigint as favorites_total,
    (
      select coalesce(abs(sum(t.amount)), 0)
      from public.transactions t, me
      where t.user_id = me.uid
        and p_scope in ('rental', 'sale', 'service', 'food')
        and t.type in ('vip_boost', 'super_vip', 'sms_package')
        and t.amount < 0
        and (p_listing_ids is null or t.reference_id = any (p_listing_ids))
        and (p_from is null or t.created_at >= p_from)
        and (p_to is null or t.created_at < p_to)
    )::numeric as spent,
    (
      select coalesce(sum(coalesce(po.price, op.price_per_night, 0)), 0)
      from public.calendar_blocks cb
      join owned_props op on op.id = cb.property_id
      left join public.price_overrides po
        on po.property_id = cb.property_id
        and po.date = cb.date
      where p_scope = 'rental'
        and cb.status = 'booked'
        and (p_from is null or cb.date >= p_from::date)
        and (p_to is null or cb.date < p_to::date)
    )::numeric as revenue;
$$;

revoke all on function public.owner_dashboard_stats(text, timestamptz, timestamptz, uuid[]) from public;
revoke all on function public.owner_dashboard_stats(text, timestamptz, timestamptz, uuid[]) from anon;
grant execute on function public.owner_dashboard_stats(text, timestamptz, timestamptz, uuid[]) to authenticated;
