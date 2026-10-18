-- C46 — ad & banner analytics: one daily rollup for BOTH creative tables.
--
-- Before this, only `ads` counted anything (lifetime `views_count` /
-- `clicks_count`, no dates), and editorial `landing_banners` counted nothing.
-- The admin had no way to see when a creative was seen, where, or how it
-- compares with the others.
--
-- One row per (Tbilisi day, source, creative, placement) with three counters:
--   views  — the creative was at least 50% on screen for 1 s (once per browser
--            tab session per creative, see src/lib/banner-tracking.ts)
--   opens  — the visitor opened the banner's detail window
--   clicks — the visitor followed the banner's link (an ad itself, a CTA
--            button, or the CTA inside the detail window)
-- CTR = clicks / views for both sources, so ads and editorial banners compare.
--
-- No IP, user, device or visitor id is stored: these are aggregate counts, so
-- they need no consent gate and no retention entry (C37). Placement is copied
-- from the creative's own row at event time, never taken from the browser.
-- There is no FK to the creative tables on purpose: deleting an expired ad
-- must not rewrite past totals.

create table if not exists public.banner_metrics_daily (
  day date not null,
  source text not null check (source in ('ad', 'banner')),
  creative_id uuid not null,
  placement text not null,
  views integer not null default 0 check (views >= 0),
  opens integer not null default 0 check (opens >= 0),
  clicks integer not null default 0 check (clicks >= 0),
  primary key (day, source, creative_id, placement)
);

create index if not exists banner_metrics_daily_creative_idx
  on public.banner_metrics_daily (source, creative_id, day);

alter table public.banner_metrics_daily enable row level security;
-- No policies: only the two definer functions below (and service_role) touch it.
revoke all on table public.banner_metrics_daily from public, anon, authenticated;

comment on table public.banner_metrics_daily is
  'C46: daily views/opens/clicks per ad or editorial banner (Asia/Tbilisi days). Written only by record_banner_event, read by admin_banner_analytics.';

-- Write path. Called by POST /api/banner-slots/track (service role) for an
-- anonymous beacon. Counts only a creative that is live right now, so a random
-- or replayed id cannot create rows or inflate a paused/expired campaign.
-- For ads it also keeps the lifetime counters the ads page has always shown
-- (those columns are audit noise, so no audit row is written).
-- Supersedes increment_ad_metric, which stays until every deploy has the new
-- route and can then be dropped.
create or replace function public.record_banner_event(
  p_source text,
  p_id uuid,
  p_event text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_placement text;
  v_day date := (now() at time zone 'Asia/Tbilisi')::date;
begin
  if p_event is null or p_event not in ('view', 'open', 'click') then
    raise exception 'invalid event %', p_event using errcode = '22023';
  end if;

  if p_source = 'ad' then
    if p_event = 'open' then
      select a.placement into v_placement
      from public.ads a
      where a.id = p_id
        and a.status = 'active'
        and a.start_at <= now()
        and a.end_at >= now();
    else
      update public.ads a
      set
        views_count = a.views_count + (p_event = 'view')::int,
        clicks_count = a.clicks_count + (p_event = 'click')::int
      where a.id = p_id
        and a.status = 'active'
        and a.start_at <= now()
        and a.end_at >= now()
      returning a.placement into v_placement;
    end if;
  elsif p_source = 'banner' then
    select b.placement into v_placement
    from public.landing_banners b
    where b.id = p_id
      and b.active
      and (b.start_at is null or b.start_at <= now())
      and (b.end_at is null or b.end_at >= now());
  else
    raise exception 'invalid source %', p_source using errcode = '22023';
  end if;

  if v_placement is null then
    return false;
  end if;

  insert into public.banner_metrics_daily as m
    (day, source, creative_id, placement, views, opens, clicks)
  values (
    v_day, p_source, p_id, v_placement,
    (p_event = 'view')::int, (p_event = 'open')::int, (p_event = 'click')::int
  )
  on conflict (day, source, creative_id, placement) do update
  set
    views = m.views + excluded.views,
    opens = m.opens + excluded.opens,
    clicks = m.clicks + excluded.clicks;

  return true;
end;
$$;

revoke all on function public.record_banner_event(text, uuid, text)
  from public, anon, authenticated;
grant execute on function public.record_banner_event(text, uuid, text)
  to service_role;

comment on function public.record_banner_event(text, uuid, text) is
  'C46: counts one view/open/click for a live ad or editorial banner into banner_metrics_daily (and the ads lifetime counters). Service role only; called by POST /api/banner-slots/track.';

-- Read path: the ONE definition of every number on the admin ad-analytics
-- page and the metric rows on the ads and banners pages (C26 style).
-- Days are inclusive Tbilisi dates, at most 366 of them. Filters are optional;
-- p_source + p_creative narrow everything to one creative (its own report).
-- `creatives` lists every creative with events in the range, plus (when the
-- range reaches today) every creative live right now, so a live banner that
-- nobody sees shows up with zeros instead of being invisible, plus the one
-- asked for by p_creative whatever its state (an expired ad's own report).
-- `live_now` counts live creatives under the same filters, whatever the range.
-- `all_time_views` / `all_time_clicks` are the ads lifetime counters, which
-- predate the rollup; they are never added to the range numbers.
drop function if exists public.admin_banner_analytics(date, date, text, text);
create or replace function public.admin_banner_analytics(
  p_from date,
  p_to date,
  p_source text default null,
  p_placement text default null,
  p_creative uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_today date := (now() at time zone 'Asia/Tbilisi')::date;
  v_result jsonb;
begin
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 365 then
    raise exception 'invalid range' using errcode = '22023';
  end if;
  if p_source is not null and p_source not in ('ad', 'banner') then
    raise exception 'invalid source %', p_source using errcode = '22023';
  end if;

  with m as (
    select d.*
    from public.banner_metrics_daily d
    where d.day between p_from and p_to
      and (p_source is null or d.source = p_source)
      and (p_placement is null or d.placement = p_placement)
      and (p_creative is null or d.creative_id = p_creative)
  ),
  creatives as (
    select
      'ad'::text as source,
      a.id,
      a.title,
      a.placement,
      a.start_at,
      a.end_at,
      case
        when a.status = 'paused' then 'paused'
        when a.end_at < now() then 'expired'
        when a.start_at > now() then 'scheduled'
        else 'live'
      end as status,
      a.views_count as all_time_views,
      a.clicks_count as all_time_clicks
    from public.ads a
    union all
    select
      'banner'::text,
      b.id,
      b.title,
      b.placement,
      b.start_at,
      b.end_at,
      case
        when not b.active then 'off'
        when b.end_at is not null and b.end_at < now() then 'expired'
        when b.start_at is not null and b.start_at > now() then 'scheduled'
        else 'live'
      end,
      null::integer,
      null::integer
    from public.landing_banners b
  ),
  per_creative as (
    select
      m.source,
      m.creative_id,
      (array_agg(m.placement order by m.day desc))[1] as last_placement,
      sum(m.views)::bigint as views,
      sum(m.opens)::bigint as opens,
      sum(m.clicks)::bigint as clicks
    from m
    group by m.source, m.creative_id
  ),
  creative_rows as (
    select
      coalesce(pc.source, c.source) as source,
      coalesce(pc.creative_id, c.id) as id,
      c.title,
      coalesce(c.placement, pc.last_placement) as placement,
      coalesce(c.status, 'deleted') as status,
      c.start_at,
      c.end_at,
      coalesce(pc.views, 0) as views,
      coalesce(pc.opens, 0) as opens,
      coalesce(pc.clicks, 0) as clicks,
      c.all_time_views,
      c.all_time_clicks
    from per_creative pc
    full join creatives c
      on c.source = pc.source and c.id = pc.creative_id
    where pc.creative_id is not null
      or (p_creative is not null and c.id = p_creative and c.source = p_source)
      or (
        p_to >= v_today
        and c.status = 'live'
        and (p_source is null or c.source = p_source)
        and (p_placement is null or c.placement = p_placement)
        and (p_creative is null or c.id = p_creative)
      )
  ),
  per_day as (
    select m.day, sum(m.views) as views, sum(m.opens) as opens, sum(m.clicks) as clicks
    from m
    group by m.day
  ),
  per_placement as (
    select
      m.placement,
      sum(m.views)::bigint as views,
      sum(m.opens)::bigint as opens,
      sum(m.clicks)::bigint as clicks,
      count(distinct (m.source, m.creative_id)) as creatives
    from m
    group by m.placement
  )
  select jsonb_build_object(
    'from', p_from,
    'to', p_to,
    'tracked_since', (select min(d.day) from public.banner_metrics_daily d),
    'live_now', (
      select count(*)
      from creatives c
      where c.status = 'live'
        and (p_source is null or c.source = p_source)
        and (p_placement is null or c.placement = p_placement)
        and (p_creative is null or c.id = p_creative)
    ),
    'totals', (
      select jsonb_build_object(
        'views', coalesce(sum(m.views), 0),
        'opens', coalesce(sum(m.opens), 0),
        'clicks', coalesce(sum(m.clicks), 0)
      )
      from m
    ),
    'daily', (
      select jsonb_agg(
        jsonb_build_object(
          'day', g.day::date,
          'views', coalesce(pd.views, 0),
          'opens', coalesce(pd.opens, 0),
          'clicks', coalesce(pd.clicks, 0)
        )
        order by g.day
      )
      from generate_series(p_from, p_to, interval '1 day') as g(day)
      left join per_day pd on pd.day = g.day::date
    ),
    'by_placement', (
      select coalesce(jsonb_agg(to_jsonb(pp) order by pp.views desc, pp.placement), '[]'::jsonb)
      from per_placement pp
    ),
    'creatives', (
      select coalesce(jsonb_agg(to_jsonb(cr) order by cr.views desc, cr.clicks desc, cr.title), '[]'::jsonb)
      from creative_rows cr
    )
  )
  into v_result;

  return v_result;
end;
$$;

revoke all on function public.admin_banner_analytics(date, date, text, text, uuid)
  from public, anon, authenticated;
grant execute on function public.admin_banner_analytics(date, date, text, text, uuid)
  to service_role;

comment on function public.admin_banner_analytics(date, date, text, text, uuid) is
  'C46: admin ad/banner analytics for a Tbilisi date range (totals, daily series, per placement, per creative). Service role only; called by GET /api/admin/banner-analytics after requireAdmin.';
