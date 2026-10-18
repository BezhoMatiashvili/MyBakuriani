-- C47 — ad campaigns per the owner's media plan
-- ("MyBakuriani_Advertising_Media_Plan_Rate_Card_v1.0", 2026-10-06).
--
-- 1. `mobile_strip`: the phone-only strip the card sells as
--    "მობილური — ზოლი" (C12: registry, both CHECKs, one mount, a label).
-- 2. Every campaign (an `ads` row) carries what §7 lists: placement,
--    start/end, SOV/weight (`sov_percent` 25 | 50 | 100), priority (1–10) and
--    a frequency cap (viewable impressions per device per day, NULL = none).
--    Creative, click URL, status and the counters were already there.
--    Existing rows take the column defaults (25 %, priority 5, no cap); prod
--    had no live ad when this was written (4 expired rows).
-- 3. `ads_enforce_slot_capacity`: the SOV booked in one placement never goes
--    over 100 %, so a 100 % booking excludes every other ad of that slot (§7)
--    and a slot holds at most four 25 % ads (§4). Conservative on purpose: it
--    adds up every active ad whose window overlaps the new one anywhere, even
--    two that never run on the same day. The sponsored grid card is sold "by
--    rotation" (no share to run out of) and is exempt. Enforced here, not only
--    in the route, because the admin routes write with the service role.
-- 4. Reporting (§6): `impressions` (every viewable display) and `reach` (the
--    first viewable display of that creative on a device) on
--    banner_metrics_daily, and banner_slot_daily: every viewable display of a
--    slot's ad position, filled or not, the denominator of "actual SOV".
--    Existing rows: impressions := views (each was a display; a lower bound).
--    Still no IP, user or device id: reach is a flag the browser sends with
--    the first impression it ever sends for that creative.
-- 5. record_banner_events: the batched beacon's writer (one call per flush,
--    at most 50 events). record_banner_event stays for app builds that still
--    send one event at a time; drop it once every deploy runs the new route.
-- 6. admin_banner_analytics re-created with impressions, reach, the campaign
--    fields and the slot denominator. Same signature, same grants.

-- 1. Placements ---------------------------------------------------------------

alter table public.landing_banners
  drop constraint if exists landing_banners_placement_check;
alter table public.landing_banners
  add constraint landing_banners_placement_check check (placement in (
    'header_strip', 'mobile_strip', 'footer_leaderboard', 'sticky_bottom',
    'home_hero', 'home_top_strip', 'home_promo', 'home_between_sections',
    'listing_top', 'listing_grid', 'detail_sidebar', 'blog_inline'
  ));

alter table public.ads drop constraint if exists ads_placement_check;
alter table public.ads
  add constraint ads_placement_check check (placement in (
    'header_strip', 'mobile_strip', 'footer_leaderboard', 'sticky_bottom',
    'home_hero', 'home_top_strip', 'home_promo', 'home_between_sections',
    'listing_top', 'listing_grid', 'detail_sidebar', 'blog_inline'
  ));

-- 2. Campaign fields ------------------------------------------------------------

alter table public.ads
  add column if not exists sov_percent smallint not null default 25,
  add column if not exists priority smallint not null default 5,
  add column if not exists frequency_cap_per_day smallint;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'ads_sov_percent_check') then
    alter table public.ads
      add constraint ads_sov_percent_check check (sov_percent in (25, 50, 100));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'ads_priority_check') then
    alter table public.ads
      add constraint ads_priority_check check (priority between 1 and 10);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'ads_frequency_cap_check') then
    alter table public.ads
      add constraint ads_frequency_cap_check check (
        frequency_cap_per_day is null or frequency_cap_per_day between 1 and 50
      );
  end if;
end
$$;

comment on column public.ads.sov_percent is
  'C47: share of voice — the part of the slot''s page views this ad is drawn on (25/50/100). For the rotation-sold listing_grid it is the rotation weight.';
comment on column public.ads.priority is
  'C47: 1–10, higher is served first; if a slot is oversold the lowest priority loses its share.';
comment on column public.ads.frequency_cap_per_day is
  'C47: viewable impressions per device per day before this ad is skipped there; NULL = no cap.';

-- 3. Slot capacity ---------------------------------------------------------------

create or replace function public.ads_enforce_slot_capacity()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_booked integer;
begin
  -- Only an active booking that has not ended takes capacity; the sponsored
  -- grid card is sold by rotation and has no share to run out of.
  if new.status <> 'active'
     or new.end_at <= now()
     or new.placement in ('listing_grid') then
    return new;
  end if;

  -- Two admins booking the same slot at once must not both pass.
  perform pg_advisory_xact_lock(hashtextextended('ads-slot:' || new.placement, 0));

  select coalesce(sum(a.sov_percent), 0)
  into v_booked
  from public.ads a
  where a.placement = new.placement
    and a.id <> new.id
    and a.status = 'active'
    and a.end_at > now()
    and a.start_at < new.end_at
    and a.end_at > new.start_at;

  if v_booked + new.sov_percent > 100 then
    raise exception 'AD_SLOT_FULL'
      using errcode = 'MBSOV',
            detail = greatest(100 - v_booked, 0)::text,
            hint = 'The share of voice booked in this placement would exceed 100%.';
  end if;

  return new;
end;
$$;

revoke all on function public.ads_enforce_slot_capacity() from public, anon, authenticated;

drop trigger if exists ads_enforce_slot_capacity on public.ads;
create trigger ads_enforce_slot_capacity
  before insert or update of placement, sov_percent, status, start_at, end_at
  on public.ads
  for each row execute function public.ads_enforce_slot_capacity();

comment on function public.ads_enforce_slot_capacity() is
  'C47: refuses (SQLSTATE MBSOV, detail = the free share) an active ad whose SOV would take its placement over 100% across overlapping windows. listing_grid (sold by rotation) is exempt.';

-- 4. Reporting tables ------------------------------------------------------------

alter table public.banner_metrics_daily
  add column if not exists impressions integer not null default 0,
  add column if not exists reach integer not null default 0;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'banner_metrics_daily_impressions_check') then
    alter table public.banner_metrics_daily
      add constraint banner_metrics_daily_impressions_check check (impressions >= 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'banner_metrics_daily_reach_check') then
    alter table public.banner_metrics_daily
      add constraint banner_metrics_daily_reach_check check (reach >= 0);
  end if;
end
$$;

update public.banner_metrics_daily
set impressions = views
where impressions < views;

create table if not exists public.banner_slot_daily (
  day date not null,
  placement text not null,
  impressions integer not null default 0 check (impressions >= 0),
  primary key (day, placement)
);

alter table public.banner_slot_daily enable row level security;
-- No policies: only the definer functions below (and service_role) touch it.
revoke all on table public.banner_slot_daily from public, anon, authenticated;

comment on table public.banner_slot_daily is
  'C47: viewable displays of each placement''s ad position per Asia/Tbilisi day, filled or not — the denominator of an ad''s actual SOV. Written only by record_banner_events, read by admin_banner_analytics.';

-- 5. Batched writer ----------------------------------------------------------------

create or replace function public.record_banner_events(p_events jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_day date := (now() at time zone 'Asia/Tbilisi')::date;
  v_event jsonb;
  v_type text;
  v_source text;
  v_id uuid;
  v_placement text;
  v_imp integer;
  v_view integer;
  v_reach integer;
  v_slot integer;
  v_open integer;
  v_click integer;
  v_recorded integer := 0;
begin
  if p_events is null
     or jsonb_typeof(p_events) <> 'array'
     or jsonb_array_length(p_events) > 50 then
    raise exception 'invalid events' using errcode = '22023';
  end if;

  for v_event in select e from jsonb_array_elements(p_events) as e loop
    v_type := v_event ->> 't';

    if v_type = 'empty' then
      -- An ad position seen with nothing drawn into it (the unsold share, a
      -- frequency cap, a phone page's third paid placement). Counted only
      -- while the placement has a live ad: it is the denominator of that ad's
      -- actual SOV and nothing else reads it.
      v_placement := v_event ->> 'placement';
      if exists (
        select 1
        from public.ads a
        where a.placement = v_placement
          and a.status = 'active'
          and a.start_at <= now()
          and a.end_at >= now()
      ) then
        insert into public.banner_slot_daily as s (day, placement, impressions)
        values (v_day, v_placement, 1)
        on conflict (day, placement) do update
        set impressions = s.impressions + 1;
        v_recorded := v_recorded + 1;
      end if;
      continue;
    end if;

    if v_type is null or v_type not in ('imp', 'open', 'click') then
      raise exception 'invalid event %', v_type using errcode = '22023';
    end if;

    v_source := v_event ->> 'source';
    v_id := (v_event ->> 'id')::uuid;
    v_placement := null;

    -- Counts only a creative that is live right now, with the placement of
    -- its own row, so a random or replayed id cannot create rows.
    if v_source = 'ad' then
      select a.placement into v_placement
      from public.ads a
      where a.id = v_id
        and a.status = 'active'
        and a.start_at <= now()
        and a.end_at >= now();
    elsif v_source = 'banner' then
      select b.placement into v_placement
      from public.landing_banners b
      where b.id = v_id
        and b.active
        and (b.start_at is null or b.start_at <= now())
        and (b.end_at is null or b.end_at >= now());
    else
      raise exception 'invalid source %', v_source using errcode = '22023';
    end if;

    if v_placement is null then
      continue;
    end if;

    v_imp := (v_type = 'imp')::int;
    -- `views` keeps its C46 meaning: the first impression in a tab session.
    -- A missing flag is NULL, never 1 (`is not distinct from`, not `=`).
    v_view := (v_type = 'imp' and (v_event ->> 's') is not distinct from '1')::int;
    v_reach := (v_type = 'imp' and (v_event ->> 'r') is not distinct from '1')::int;
    v_slot := (v_type = 'imp' and (v_event ->> 'slot') is not distinct from '1')::int;
    v_open := (v_type = 'open')::int;
    v_click := (v_type = 'click')::int;

    insert into public.banner_metrics_daily as m
      (day, source, creative_id, placement, views, opens, clicks, impressions, reach)
    values
      (v_day, v_source, v_id, v_placement, v_view, v_open, v_click, v_imp, v_reach)
    on conflict (day, source, creative_id, placement) do update
    set
      views = m.views + excluded.views,
      opens = m.opens + excluded.opens,
      clicks = m.clicks + excluded.clicks,
      impressions = m.impressions + excluded.impressions,
      reach = m.reach + excluded.reach;

    -- The ads page's lifetime counters keep their meaning (session views and
    -- clicks); audit noise, so no audit row.
    if v_source = 'ad' and (v_view = 1 or v_click = 1) then
      update public.ads a
      set
        views_count = a.views_count + v_view,
        clicks_count = a.clicks_count + v_click
      where a.id = v_id;
    end if;

    -- The ad position's denominator, like an empty one: an editorial banner
    -- holding it counts only while the placement has a live ad (house
    -- impressions from before an ad started that day would understate its
    -- actual SOV).
    if v_slot = 1 and (
      v_source = 'ad'
      or exists (
        select 1
        from public.ads a
        where a.placement = v_placement
          and a.status = 'active'
          and a.start_at <= now()
          and a.end_at >= now()
      )
    ) then
      insert into public.banner_slot_daily as s (day, placement, impressions)
      values (v_day, v_placement, 1)
      on conflict (day, placement) do update
      set impressions = s.impressions + 1;
    end if;

    v_recorded := v_recorded + 1;
  end loop;

  return v_recorded;
end;
$$;

revoke all on function public.record_banner_events(jsonb) from public, anon, authenticated;
grant execute on function public.record_banner_events(jsonb) to service_role;

comment on function public.record_banner_events(jsonb) is
  'C47: the batched banner beacon (at most 50 events: imp with s/r/slot flags, open, click, empty). Counts only live creatives into banner_metrics_daily and banner_slot_daily. Service role only; called by POST /api/banner-slots/track.';

-- 6. Read path -----------------------------------------------------------------------

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
  slots as (
    select s.day, s.placement, s.impressions
    from public.banner_slot_daily s
    where s.day between p_from and p_to
      and (p_placement is null or s.placement = p_placement)
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
      a.clicks_count as all_time_clicks,
      a.sov_percent::integer as sov_percent,
      a.priority::integer as priority,
      a.frequency_cap_per_day::integer as frequency_cap
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
      null::integer,
      null::integer,
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
      sum(m.clicks)::bigint as clicks,
      sum(m.impressions)::bigint as impressions,
      sum(m.reach)::bigint as reach
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
      coalesce(pc.impressions, 0) as impressions,
      coalesce(pc.reach, 0) as reach,
      c.all_time_views,
      c.all_time_clicks,
      c.sov_percent,
      c.priority,
      c.frequency_cap,
      -- Actual SOV's denominator: the placement's ad-position displays on the
      -- days this creative ran inside the range.
      (
        select coalesce(sum(s.impressions), 0)
        from slots s
        where s.placement = coalesce(c.placement, pc.last_placement)
          and s.day >= greatest(
            p_from,
            coalesce((c.start_at at time zone 'Asia/Tbilisi')::date, p_from)
          )
          and s.day <= least(
            p_to,
            coalesce((c.end_at at time zone 'Asia/Tbilisi')::date, p_to)
          )
      )::bigint as slot_impressions
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
    select
      m.day,
      sum(m.views) as views,
      sum(m.opens) as opens,
      sum(m.clicks) as clicks,
      sum(m.impressions) as impressions
    from m
    group by m.day
  ),
  per_placement as (
    select
      m.placement,
      sum(m.views)::bigint as views,
      sum(m.opens)::bigint as opens,
      sum(m.clicks)::bigint as clicks,
      sum(m.impressions)::bigint as impressions,
      sum(m.reach)::bigint as reach,
      count(distinct (m.source, m.creative_id)) as creatives,
      (
        select coalesce(sum(s.impressions), 0)
        from slots s
        where s.placement = m.placement
      )::bigint as slot_impressions
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
        'clicks', coalesce(sum(m.clicks), 0),
        'impressions', coalesce(sum(m.impressions), 0),
        'reach', coalesce(sum(m.reach), 0)
      )
      from m
    ),
    'daily', (
      select jsonb_agg(
        jsonb_build_object(
          'day', g.day::date,
          'views', coalesce(pd.views, 0),
          'opens', coalesce(pd.opens, 0),
          'clicks', coalesce(pd.clicks, 0),
          'impressions', coalesce(pd.impressions, 0)
        )
        order by g.day
      )
      from generate_series(p_from, p_to, interval '1 day') as g(day)
      left join per_day pd on pd.day = g.day::date
    ),
    'by_placement', (
      select coalesce(jsonb_agg(to_jsonb(pp) order by pp.impressions desc, pp.placement), '[]'::jsonb)
      from per_placement pp
    ),
    'creatives', (
      select coalesce(jsonb_agg(to_jsonb(cr) order by cr.impressions desc, cr.clicks desc, cr.title), '[]'::jsonb)
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
  'C46/C47: admin ad/banner analytics for a Tbilisi date range (totals, daily series, per placement, per creative with impressions, reach, SOV fields and the slot denominator of actual SOV). Service role only; called by GET /api/admin/banner-analytics after requireAdmin.';
