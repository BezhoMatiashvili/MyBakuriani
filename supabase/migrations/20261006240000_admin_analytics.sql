-- Admin analytics (C49), owner spec "Admin Dashboard.docx": GA-style traffic
-- KPIs, sources, device/geo/page-type filters, Live Now, listing, Smart Match
-- and advertising blocks on /dashboard/admin. STAGING first; prod order is in
-- docs/contracts.md C49.
--
-- Vocabularies here must equal src/lib/analytics/model.ts (TRAFFIC_SOURCES,
-- DEVICES, PAGE_TYPES, LISTING_KINDS, EVENT_NAMES, LEAD_EVENTS); checked by
-- scripts/unit/analytics-model.test.mjs and check-contracts C49.
--
-- Collection stays consent-gated (C38): only visitors with analytics=1 get
-- page_views / analytics_events rows. Only derived categories are stored
-- (source, device class, country, city, page type); never a User-Agent, a
-- referrer URL or an IP.

-- ------------------------------------------------------------ helpers

-- Section of the public site for a locale-free, query-free path (the paths
-- /api/track/view accepts, src/lib/analytics/pageview.ts).
create or replace function public.analytics_page_type(p_path text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select case
    when p_path is null or p_path = '' then 'other'
    when p_path = '/' then 'home'
    when p_path ~ '^/(apartments|appartments)(/|$)' then 'apartments'
    when p_path ~ '^/hotels(/|$)' then 'hotels'
    when p_path ~ '^/sales(/|$)' then 'sales'
    when p_path ~ '^/food(/|$)' then 'food'
    when p_path ~ '^/services(/|$)' then 'services'
    when p_path ~ '^/entertainment(/|$)' then 'entertainment'
    when p_path ~ '^/transport(/|$)' then 'transport'
    when p_path ~ '^/employment(/|$)' then 'employment'
    when p_path ~ '^/search(/|$)' then 'search'
    when p_path ~ '^/blog(/|$)' then 'blog'
    when p_path ~ '^/bakuriani(/|$)' then 'guide'
    when p_path ~ '^/(faq|contact|terms|privacy|pricing|marketing-policy)(/|$)' then 'info'
    else 'other'
  end
$$;

-- Listing category: the same split the public category pages use.
create or replace function public.analytics_listing_kind(
  p_table text,
  p_is_for_sale boolean,
  p_type text
)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select case
    when p_table = 'property' then
      case
        when coalesce(p_is_for_sale, false) then 'sales'
        when p_type = 'hotel' then 'hotels'
        else 'apartments'
      end
    when p_type in ('food', 'entertainment', 'transport', 'employment') then p_type
    else 'services'
  end
$$;

create or replace function public.analytics_check_range(p_from date, p_to date)
returns void
language plpgsql
immutable
set search_path = ''
as $$
begin
  -- 366 days inclusive: the same cap as admin_banner_analytics (the ads block).
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 365 then
    raise exception 'invalid analytics range % - %', p_from, p_to
      using errcode = '22023';
  end if;
end;
$$;

create or replace function public.analytics_check_dims(
  p_device text,
  p_country text,
  p_city text,
  p_source text,
  p_page_type text
)
returns void
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_device is not null and p_device not in ('mobile', 'tablet', 'desktop') then
    raise exception 'invalid device %', p_device using errcode = '22023';
  end if;
  if p_source is not null
     and p_source not in ('google', 'facebook', 'instagram', 'direct', 'referral') then
    raise exception 'invalid source %', p_source using errcode = '22023';
  end if;
  if p_page_type is not null and p_page_type not in (
    'home', 'apartments', 'hotels', 'sales', 'food', 'services', 'entertainment',
    'transport', 'employment', 'search', 'blog', 'guide', 'info', 'other'
  ) then
    raise exception 'invalid page type %', p_page_type using errcode = '22023';
  end if;
  if p_country is not null and p_country !~ '^[A-Z]{2}$' then
    raise exception 'invalid country %', p_country using errcode = '22023';
  end if;
  if p_city is not null and (p_country is null or char_length(p_city) > 80) then
    raise exception 'invalid city' using errcode = '22023';
  end if;
end;
$$;

-- ---------------------------------------------------------- page_views

alter table public.page_views
  add column if not exists session_id uuid,
  add column if not exists source text,
  add column if not exists referrer_host text,
  add column if not exists utm_source text,
  add column if not exists utm_medium text,
  add column if not exists utm_campaign text,
  add column if not exists device text,
  add column if not exists country text,
  add column if not exists city text,
  add column if not exists engaged_ms integer not null default 0,
  add column if not exists last_seen_at timestamptz,
  add column if not exists page_type text
    generated always as (public.analytics_page_type(path)) stored;

alter table public.page_views
  add constraint page_views_source_check check (
    source is null or source in ('google', 'facebook', 'instagram', 'direct', 'referral')
  ),
  add constraint page_views_device_check check (
    device is null or device in ('mobile', 'tablet', 'desktop')
  ),
  add constraint page_views_country_check check (
    country is null or country ~ '^[A-Z]{2}$'
  ),
  add constraint page_views_city_check check (
    city is null or char_length(city) between 1 and 80
  ),
  add constraint page_views_referrer_host_check check (
    referrer_host is null or char_length(referrer_host) between 1 and 253
  ),
  add constraint page_views_utm_check check (
    char_length(coalesce(utm_source, '')) <= 100
    and char_length(coalesce(utm_medium, '')) <= 100
    and char_length(coalesce(utm_campaign, '')) <= 100
  ),
  add constraint page_views_engaged_ms_check check (
    engaged_ms between 0 and 14400000
  );

-- Sessions for the rows recorded before session cookies existed: a new
-- session after 30 minutes without a hit, per visitor (the same rule the
-- mb_sid cookie applies from now on). Deterministic ids.
with ordered as (
  select
    p.id,
    p.visitor_id,
    p.created_at,
    case
      when lag(p.created_at) over w is null
        or p.created_at - lag(p.created_at) over w > interval '30 minutes'
      then 1 else 0
    end as starts
  from public.page_views p
  where p.session_id is null
  window w as (partition by p.visitor_id order by p.created_at, p.id)
),
numbered as (
  select
    o.id,
    o.visitor_id,
    sum(o.starts) over (
      partition by o.visitor_id order by o.created_at, o.id
      rows unbounded preceding
    ) as n
  from ordered o
)
update public.page_views p
set session_id = md5(n.visitor_id || ':' || n.n::text)::uuid
from numbered n
where p.id = n.id;

create index if not exists page_views_session_idx
  on public.page_views (session_id);
create index if not exists page_views_last_seen_idx
  on public.page_views (last_seen_at)
  where last_seen_at is not null;

-- ------------------------------------------------------ analytics_events

-- Visitor actions with their analytics session (spec decision: filters cut
-- every block). Written only by the service role (src/lib/analytics/events.ts)
-- for visitors with analytics consent. entity_id = the listing (property or
-- service) or the Smart Match request.
create table if not exists public.analytics_events (
  id uuid primary key default gen_random_uuid(),
  name text not null check (name in (
    'listing_view', 'save', 'call', 'message', 'smart_match_request', 'job_application'
  )),
  entity_type text check (
    entity_type is null or entity_type in ('property', 'service', 'smart_match_request')
  ),
  entity_id uuid,
  visitor_id text not null,
  user_id uuid references public.profiles(id) on delete set null,
  session_id uuid,
  source text check (
    source is null or source in ('google', 'facebook', 'instagram', 'direct', 'referral')
  ),
  device text check (device is null or device in ('mobile', 'tablet', 'desktop')),
  country text check (country is null or country ~ '^[A-Z]{2}$'),
  city text check (city is null or char_length(city) between 1 and 80),
  path text check (path is null or char_length(path) <= 512),
  page_type text generated always as (public.analytics_page_type(path)) stored,
  created_at timestamptz not null default now()
);

create index if not exists analytics_events_name_created_idx
  on public.analytics_events (name, created_at);
create index if not exists analytics_events_session_idx
  on public.analytics_events (session_id);
create index if not exists analytics_events_entity_idx
  on public.analytics_events (entity_id)
  where entity_id is not null;

alter table public.analytics_events enable row level security;
revoke all on public.analytics_events from public, anon, authenticated;
grant select, insert, update, delete on public.analytics_events to service_role;

-- --------------------------------------------- calls vs messages, advertiser

-- Which button revealed the number (CallButton = call, WhatsAppButton =
-- whatsapp). NULL = recorded before the split.
alter table public.contact_reveal_events
  add column if not exists channel text
    check (channel is null or channel in ('call', 'whatsapp'));

-- The client an ad is sold to ("active advertisers", spec §7).
alter table public.ads
  add column if not exists advertiser text
    check (advertiser is null or char_length(advertiser) between 1 and 120);

-- ------------------------------------------------------- person key (§10)

-- A browser (mb_vid) that was ever signed in to exactly one account belongs to
-- that account, so its anonymous hits count as the same person. One unique
-- user = user_id when known, else this stitched account, else the cookie id;
-- never the IP. Links older than 90 days are gone (C37), so stitching only
-- reaches that far back.
create or replace view public.analytics_person_map_v
with (security_invoker = true) as
select
  pv.visitor_id,
  (array_agg(distinct pv.user_id))[1] as user_id
from public.page_views pv
where pv.user_id is not null
group by pv.visitor_id
having count(distinct pv.user_id) = 1;

revoke all on public.analytics_person_map_v from public, anon, authenticated;
grant select on public.analytics_person_map_v to service_role;

-- ------------------------------------------------- traffic (§2, §3, §4, §8)

create or replace function public.admin_analytics_traffic(
  p_from date,
  p_to date,
  p_granularity text default 'day',
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
  v_result jsonb;
begin
  perform public.analytics_check_range(p_from, p_to);
  perform public.analytics_check_dims(p_device, p_country, p_city, p_source, p_page_type);
  if p_granularity is null or p_granularity not in ('day', 'week', 'month') then
    raise exception 'invalid granularity %', p_granularity using errcode = '22023';
  end if;
  v_t0 := p_from::timestamp at time zone 'Asia/Tbilisi';
  v_t1 := (p_to + 1)::timestamp at time zone 'Asia/Tbilisi';

  with hits as (
    select
      coalesce(p.session_id, p.id) as session_id,
      p.created_at,
      p.source,
      coalesce(p.user_id::text, m.user_id::text, 'v:' || p.visitor_id) as person,
      date_trunc(p_granularity, p.created_at at time zone 'Asia/Tbilisi')::date as bucket
    from public.page_views p
    left join public.analytics_person_map_v m on m.visitor_id = p.visitor_id
    where p.created_at >= v_t0
      and p.created_at < v_t1
      and (p_device is null or p.device = p_device)
      and (p_country is null or p.country = p_country)
      and (p_city is null or p.city = p_city)
      and (p_source is null or p.source = p_source)
      and (p_page_type is null or p.page_type = p_page_type)
  ),
  -- Engagement belongs to the whole session in the period, not only to the
  -- hits a filter kept: >= 10 s visible, >= 2 page views, or a lead event.
  session_facts as (
    select
      coalesce(p.session_id, p.id) as session_id,
      count(*) as views,
      sum(p.engaged_ms) as engaged_ms
    from public.page_views p
    where p.created_at >= v_t0
      and p.created_at < v_t1
      and coalesce(p.session_id, p.id) in (select h.session_id from hits h)
    group by 1
  ),
  lead_sessions as (
    select distinct e.session_id
    from public.analytics_events e
    where e.created_at >= v_t0
      and e.created_at < v_t1
      and e.name in ('call', 'message', 'smart_match_request', 'job_application')
      and e.session_id in (select h.session_id from hits h)
  ),
  -- One row per session. A session can hold more than one person key (a
  -- browser shared by two accounts is never stitched), so person counts are
  -- always taken over hits, never one person per session.
  sessions as (
    select
      h.session_id,
      min(h.source) as source,
      min(h.bucket) as bucket
    from hits h
    group by h.session_id
  ),
  sessions_e as (
    select
      s.*,
      (coalesce(f.engaged_ms, 0) >= 10000
        or coalesce(f.views, 0) >= 2
        or l.session_id is not null) as engaged
    from sessions s
    left join session_facts f on f.session_id = s.session_id
    left join lead_sessions l on l.session_id = s.session_id
  ),
  first_seen as (
    select
      coalesce(p.user_id::text, m.user_id::text, 'v:' || p.visitor_id) as person,
      min(p.created_at) as first_at
    from public.page_views p
    left join public.analytics_person_map_v m on m.visitor_id = p.visitor_id
    group by 1
  ),
  people as (
    select distinct h.person, f.first_at
    from hits h
    join first_seen f on f.person = h.person
  ),
  key_actions as (
    select e.name, count(*) as n
    from public.analytics_events e
    where e.created_at >= v_t0
      and e.created_at < v_t1
      and e.name in ('call', 'message', 'smart_match_request', 'job_application')
      and (p_device is null or e.device = p_device)
      and (p_country is null or e.country = p_country)
      and (p_city is null or e.city = p_city)
      and (p_source is null or e.source = p_source)
      and (p_page_type is null or e.page_type = p_page_type)
    group by e.name
  ),
  buckets as (
    select g::date as bucket
    from generate_series(
      date_trunc(p_granularity, p_from::timestamp),
      date_trunc(p_granularity, p_to::timestamp),
      ('1 ' || p_granularity)::interval
    ) as g
  ),
  b_hits as (
    select h.bucket, count(*) as pageviews, count(distinct h.person) as users
    from hits h
    group by h.bucket
  ),
  b_new as (
    select h.bucket, count(distinct h.person) as n
    from hits h
    join first_seen f on f.person = h.person
    where date_trunc(p_granularity, f.first_at at time zone 'Asia/Tbilisi')::date = h.bucket
    group by h.bucket
  ),
  b_sessions as (
    select s.bucket, count(*) as sessions
    from sessions_e s
    group by s.bucket
  ),
  b_active as (
    select h.bucket, count(distinct h.person) as n
    from hits h
    join sessions_e s on s.session_id = h.session_id
    where s.engaged
    group by h.bucket
  ),
  by_source as (
    select
      coalesce(s.source, 'unknown') as source,
      count(distinct h.person) as users,
      count(distinct s.session_id) as sessions,
      count(distinct s.session_id) filter (where s.engaged) as engaged_sessions
    from sessions_e s
    join hits h on h.session_id = s.session_id
    group by 1
  )
  select jsonb_build_object(
    'from', p_from,
    'to', p_to,
    'granularity', p_granularity,
    'kpis', jsonb_build_object(
      'unique_users', (select count(distinct h.person) from hits h),
      'active_users', (
        select count(distinct h.person)
        from hits h
        join sessions_e s on s.session_id = h.session_id
        where s.engaged
      ),
      'new_users', (select count(*) from people pe where pe.first_at >= v_t0),
      'returning_users', (select count(*) from people pe where pe.first_at < v_t0),
      'sessions', (select count(*) from sessions_e),
      'pageviews', (select count(*) from hits),
      'engaged_sessions', (select count(*) from sessions_e s where s.engaged),
      'engagement_rate', (
        select round(count(*) filter (where s.engaged)::numeric / nullif(count(*), 0), 4)
        from sessions_e s
      ),
      'key_actions', (select coalesce(sum(k.n), 0) from key_actions k),
      'key_actions_by_name', (
        select coalesce(jsonb_object_agg(k.name, k.n), '{}'::jsonb) from key_actions k
      )
    ),
    'series', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'bucket', b.bucket,
        'unique_users', coalesce(bh.users, 0),
        'active_users', coalesce(ba.n, 0),
        'sessions', coalesce(bs.sessions, 0),
        'pageviews', coalesce(bh.pageviews, 0),
        'new_users', coalesce(bn.n, 0),
        'returning_users', coalesce(bh.users, 0) - coalesce(bn.n, 0)
      ) order by b.bucket), '[]'::jsonb)
      from buckets b
      left join b_hits bh on bh.bucket = b.bucket
      left join b_new bn on bn.bucket = b.bucket
      left join b_sessions bs on bs.bucket = b.bucket
      left join b_active ba on ba.bucket = b.bucket
    ),
    'sources', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'source', bs.source,
        'users', bs.users,
        'sessions', bs.sessions,
        'engaged_sessions', bs.engaged_sessions,
        'engagement_rate', round(bs.engaged_sessions::numeric / nullif(bs.sessions, 0), 4)
      ) order by bs.sessions desc, bs.source), '[]'::jsonb)
      from by_source bs
    ),
    'options', jsonb_build_object(
      'countries', (
        select coalesce(jsonb_agg(x.country order by x.country), '[]'::jsonb)
        from (
          select distinct p.country
          from public.page_views p
          where p.created_at >= v_t0 and p.created_at < v_t1 and p.country is not null
        ) x
      ),
      'cities', (
        select coalesce(jsonb_agg(jsonb_build_object('country', x.country, 'city', x.city)
          order by x.country, x.city), '[]'::jsonb)
        from (
          select distinct p.country, p.city
          from public.page_views p
          where p.created_at >= v_t0 and p.created_at < v_t1 and p.city is not null
        ) x
      )
    ),
    'tracked_since', (select min(p.created_at) from public.page_views p),
    'dimensions_since', (
      select min(p.created_at) from public.page_views p where p.device is not null
    )
  ) into v_result;

  return v_result;
end;
$$;

-- ------------------------------------------------------------- Live Now (§9)

create or replace function public.admin_analytics_live(
  p_device text default null,
  p_country text default null,
  p_city text default null,
  p_source text default null,
  p_page_type text default null,
  p_minutes integer default 5
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_since timestamptz;
  v_result jsonb;
begin
  perform public.analytics_check_dims(p_device, p_country, p_city, p_source, p_page_type);
  if p_minutes is null or p_minutes < 1 or p_minutes > 60 then
    raise exception 'invalid minutes %', p_minutes using errcode = '22023';
  end if;
  v_since := now() - make_interval(mins => p_minutes);

  with recent as (
    select distinct on (x.person)
      x.person, x.path, x.page_type, x.device, x.country, x.city, x.source, x.seen_at
    from (
      select
        coalesce(p.user_id::text, m.user_id::text, 'v:' || p.visitor_id) as person,
        p.path,
        p.page_type,
        p.device,
        p.country,
        p.city,
        p.source,
        greatest(p.created_at, coalesce(p.last_seen_at, p.created_at)) as seen_at
      from public.page_views p
      left join public.analytics_person_map_v m on m.visitor_id = p.visitor_id
      where p.created_at > v_since or p.last_seen_at > v_since
    ) x
    order by x.person, x.seen_at desc
  ),
  live as (
    select r.*
    from recent r
    where r.seen_at > v_since
      and (p_device is null or r.device = p_device)
      and (p_country is null or r.country = p_country)
      and (p_city is null or r.city = p_city)
      and (p_source is null or r.source = p_source)
      and (p_page_type is null or r.page_type = p_page_type)
  )
  select jsonb_build_object(
    'at', now(),
    'window_minutes', p_minutes,
    'visitors', (select count(*) from live),
    'pages', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'path', g.path, 'page_type', g.page_type, 'visitors', g.n
      ) order by g.n desc, g.path), '[]'::jsonb)
      from (
        select l.path, l.page_type, count(*) as n
        from live l
        group by l.path, l.page_type
        order by count(*) desc, l.path
        limit 100
      ) g
    ),
    'rows', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'path', l.path,
        'page_type', l.page_type,
        'device', l.device,
        'country', l.country,
        'city', l.city,
        'source', l.source,
        'seen_at', l.seen_at
      ) order by l.seen_at desc), '[]'::jsonb)
      from (select * from live order by seen_at desc limit 200) l
    )
  ) into v_result;

  return v_result;
end;
$$;

-- ------------------------------------------------------- listings (§5)

-- Without a dimension filter the numbers come from the domain tables (every
-- visitor). With one they come from analytics_events (only visitors who
-- accepted analytics cookies; the only rows that carry device/geo/source).
-- Active and new listings describe listings, not visitors: never filtered.
create or replace function public.admin_analytics_listings(
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

  with listing as (
    select
      pr.id,
      public.analytics_listing_kind('property', pr.is_for_sale, pr.type::text) as kind,
      pr.status::text as status,
      pr.created_at
    from public.properties pr
    union all
    select
      s.id,
      public.analytics_listing_kind('service', null, s.category::text),
      s.status::text,
      s.created_at
    from public.services s
  ),
  ev as (
    select e.name, e.entity_id
    from public.analytics_events e
    where v_filtered
      and e.created_at >= v_t0
      and e.created_at < v_t1
      and e.name in ('listing_view', 'save', 'call', 'message', 'smart_match_request')
      and (p_device is null or e.device = p_device)
      and (p_country is null or e.country = p_country)
      and (p_city is null or e.city = p_city)
      and (p_source is null or e.source = p_source)
      and (p_page_type is null or e.page_type = p_page_type)
  ),
  views as (
    select v.listing_id as id
    from public.listing_view_events v
    where not v_filtered and v.created_at >= v_t0 and v.created_at < v_t1
    union all
    select ev.entity_id from ev where ev.name = 'listing_view'
  ),
  saves as (
    select coalesce(f.property_id, f.service_id) as id
    from public.favorites f
    where not v_filtered and f.created_at >= v_t0 and f.created_at < v_t1
    union all
    select ev.entity_id from ev where ev.name = 'save'
  ),
  contacts as (
    select
      c.listing_id as id,
      case c.channel when 'call' then 'call' when 'whatsapp' then 'message' else 'unsplit' end as kind
    from public.contact_reveal_events c
    where not v_filtered and c.created_at >= v_t0 and c.created_at < v_t1
    union all
    select ev.entity_id, ev.name from ev where ev.name in ('call', 'message')
  ),
  kinds as (
    select k.kind, k.ord
    from unnest(array[
      'apartments', 'hotels', 'sales', 'food', 'services', 'entertainment',
      'transport', 'employment'
    ]) with ordinality as k(kind, ord)
  ),
  k_active as (
    select l.kind, count(*) as n from listing l where l.status = 'active' group by l.kind
  ),
  k_new as (
    select l.kind, count(*) as n from listing l
    where l.created_at >= v_t0 and l.created_at < v_t1
    group by l.kind
  ),
  k_views as (
    select l.kind, count(*) as n from views x join listing l on l.id = x.id group by l.kind
  ),
  k_saves as (
    select l.kind, count(*) as n from saves x join listing l on l.id = x.id group by l.kind
  ),
  k_contacts as (
    select
      l.kind,
      count(*) filter (where x.kind = 'call') as calls,
      count(*) filter (where x.kind = 'message') as messages,
      count(*) filter (where x.kind = 'unsplit') as unsplit
    from contacts x join listing l on l.id = x.id
    group by l.kind
  )
  select jsonb_build_object(
    'filtered', v_filtered,
    'totals', jsonb_build_object(
      'active', (select count(*) from listing l where l.status = 'active'),
      'new', (
        select count(*) from listing l where l.created_at >= v_t0 and l.created_at < v_t1
      ),
      'views', (select count(*) from views),
      'saves', (select count(*) from saves),
      'calls', (select count(*) from contacts c where c.kind = 'call'),
      'messages', (select count(*) from contacts c where c.kind = 'message'),
      'unsplit_contacts', (select count(*) from contacts c where c.kind = 'unsplit'),
      'smart_match_requests', case
        when v_filtered then (select count(*) from ev where ev.name = 'smart_match_request')
        else (
          select count(*) from public.smart_match_requests r
          where r.created_at >= v_t0 and r.created_at < v_t1
        )
      end
    ),
    'by_kind', (
      select jsonb_agg(jsonb_build_object(
        'kind', k.kind,
        'active', coalesce(a.n, 0),
        'new', coalesce(n.n, 0),
        'views', coalesce(v.n, 0),
        'saves', coalesce(s.n, 0),
        'calls', coalesce(c.calls, 0),
        'messages', coalesce(c.messages, 0),
        'unsplit_contacts', coalesce(c.unsplit, 0)
      ) order by k.ord)
      from kinds k
      left join k_active a on a.kind = k.kind
      left join k_new n on n.kind = k.kind
      left join k_views v on v.kind = k.kind
      left join k_saves s on s.kind = k.kind
      left join k_contacts c on c.kind = k.kind
    )
  ) into v_result;

  return v_result;
end;
$$;

-- ----------------------------------------------------- Smart Match (§6)

-- Requests created in the period (with a dimension filter: those whose
-- creation event matches it). Responses = offers not withdrawn by the owner;
-- matching listings = distinct listings that sent one; match rate = requests
-- with an offer / requests; leads = offers the guest followed by revealing or
-- clicking that listing's contact.
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
    'leads', (select count(*) from leads)
  ) into v_result;

  return v_result;
end;
$$;

-- --------------------------------------------------- advertising (§7 part)

-- Impressions / clicks / CTR / per placement come from admin_banner_analytics
-- (C46); this adds what C46 does not hold. Active ads = the live predicate
-- record_banner_event uses; advertisers = distinct ads.advertiser among them;
-- revenue = finance_ledger_v advertising income net of owner shares (C42, cash
-- basis, refunds and reversals signed).
create or replace function public.admin_analytics_ads(p_from date, p_to date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_t0 timestamptz;
  v_t1 timestamptz;
  v_result jsonb;
begin
  perform public.analytics_check_range(p_from, p_to);
  v_t0 := p_from::timestamp at time zone 'Asia/Tbilisi';
  v_t1 := (p_to + 1)::timestamp at time zone 'Asia/Tbilisi';

  with live as (
    select a.id, nullif(lower(btrim(a.advertiser)), '') as advertiser
    from public.ads a
    where a.status = 'active' and a.start_at <= now() and a.end_at >= now()
  )
  select jsonb_build_object(
    'active_ads', (select count(*) from live),
    'active_advertisers', (select count(distinct l.advertiser) from live l),
    'ads_without_advertiser', (select count(*) from live l where l.advertiser is null),
    'revenue', (
      select coalesce(sum(l.amount - coalesce(l.owner_amount, 0)), 0)
      from public.finance_ledger_v l
      where l.revenue_type = 'advertising'
        and l.occurred_at >= v_t0
        and l.occurred_at < v_t1
    )
  ) into v_result;

  return v_result;
end;
$$;

-- -------------------------------------------- engagement + Live Now ping

-- /api/track/ping: adds the visible time the browser measured on a page to the
-- caller's own page view and marks it seen now (Live Now). The cookie's
-- visitor must own the row and the row must be under 6 hours old; one ping
-- adds at most 5 minutes and a row holds at most 4 hours.
create or replace function public.analytics_ping(
  p_id uuid,
  p_visitor_id text,
  p_ms integer
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  if p_id is null or p_visitor_id is null or p_ms is null or p_ms < 0 or p_ms > 300000 then
    raise exception 'invalid ping' using errcode = '22023';
  end if;
  update public.page_views p
  set
    engaged_ms = least(p.engaged_ms + p_ms, 14400000),
    last_seen_at = now()
  where p.id = p_id
    and p.visitor_id = p_visitor_id
    and p.created_at > now() - interval '6 hours';
  get diagnostics v_count = row_count;
  return v_count > 0;
end;
$$;

-- ------------------------------------------------------------------ grants

revoke all on function public.analytics_ping(uuid, text, integer) from public, anon, authenticated;
grant execute on function public.analytics_ping(uuid, text, integer) to service_role;
revoke all on function public.analytics_page_type(text) from public, anon, authenticated;
revoke all on function public.analytics_listing_kind(text, boolean, text)
  from public, anon, authenticated;
revoke all on function public.analytics_check_range(date, date) from public, anon, authenticated;
revoke all on function public.analytics_check_dims(text, text, text, text, text)
  from public, anon, authenticated;
revoke all on function public.admin_analytics_traffic(date, date, text, text, text, text, text, text)
  from public, anon, authenticated;
revoke all on function public.admin_analytics_live(text, text, text, text, text, integer)
  from public, anon, authenticated;
revoke all on function public.admin_analytics_listings(date, date, text, text, text, text, text)
  from public, anon, authenticated;
revoke all on function public.admin_analytics_smart_match(date, date, text, text, text, text, text)
  from public, anon, authenticated;
revoke all on function public.admin_analytics_ads(date, date) from public, anon, authenticated;

grant execute on function public.analytics_page_type(text) to service_role;
grant execute on function public.analytics_listing_kind(text, boolean, text) to service_role;
grant execute on function public.analytics_check_range(date, date) to service_role;
grant execute on function public.analytics_check_dims(text, text, text, text, text) to service_role;
grant execute on function public.admin_analytics_traffic(date, date, text, text, text, text, text, text)
  to service_role;
grant execute on function public.admin_analytics_live(text, text, text, text, text, integer)
  to service_role;
grant execute on function public.admin_analytics_listings(date, date, text, text, text, text, text)
  to service_role;
grant execute on function public.admin_analytics_smart_match(date, date, text, text, text, text, text)
  to service_role;
grant execute on function public.admin_analytics_ads(date, date) to service_role;

-- ------------------------------------------------------- retention (C37)

-- analytics_events.user_id follows page_views.user_id: the account link goes
-- after p_days (the rows stay, the blocks count rows). Patched into the live
-- body at one anchor; refuses (55000) when the anchor is not there exactly
-- once, and does nothing when the body already scrubs analytics_events.
do $patch$
declare
  v_fn regprocedure := 'public.apply_pii_retention(integer)'::regprocedure;
  v_def text;
  v_anchor constant text := '  GET DIAGNOSTICS v_pages = ROW_COUNT;';
begin
  v_def := pg_get_functiondef(v_fn);
  if position('analytics_events' in v_def) > 0 then
    return;
  end if;
  if (length(v_def) - length(replace(v_def, v_anchor, ''))) / length(v_anchor) <> 1 then
    raise exception '%: expected exactly one % in the live body', v_fn, v_anchor
      using errcode = '55000';
  end if;
  execute replace(
    v_def,
    v_anchor,
    v_anchor || E'\n\n  -- C49: analytics actions keep their rows; only the account link goes.\n'
      || E'  UPDATE public.analytics_events\n'
      || E'  SET user_id = NULL\n'
      || E'  WHERE created_at < v_cutoff AND user_id IS NOT NULL;'
  );
end
$patch$;
