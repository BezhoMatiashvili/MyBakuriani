-- Banner/ad placements.
--
-- Before this migration the two banner systems each had their own, incompatible
-- idea of "where does this show":
--   landing_banners.kind  -> enum info|promo|sticky_news, mapped to 3 hardcoded
--                            JSX mount points, all on the home page
--   ads.position          -> free text; the client offered slot-a|slot-b|slot-c
--                            but NOTHING ever rendered the ads table publicly
--
-- Both now carry `placement`, drawn from the shared registry in
-- src/lib/banner-placements.ts, and one component renders both.
--
-- `kind` and `position` are deliberately KEPT. `kind` is NOT NULL and is still
-- written (derived from the placement's legacyKind), so reverting the app code
-- leaves every banner rendering in a sane spot. That is what makes this
-- reversible; dropping them would not be.
--
-- No data repair here: repairing the 4 existing ad rows (bogus banner_url,
-- expired dates) is a one-off operation, and migrations replay.

alter table public.landing_banners add column if not exists placement text;
alter table public.ads add column if not exists placement text;

-- Backfill BEFORE constraining: a CHECK added first would fail to apply against
-- the existing rows.
update public.landing_banners
set placement = case kind
  when 'info' then 'home_top_strip'
  when 'promo' then 'home_promo'
  when 'sticky_news' then 'sticky_bottom'
end
where placement is null;

update public.ads
set placement = case position
  when 'slot-a' then 'home_hero'
  when 'slot-b' then 'listing_grid'
  when 'slot-c' then 'detail_sidebar'
  -- `position` never had a CHECK constraint, so an unrecognised legacy value is
  -- possible; park it on the home leaderboard rather than leaving it NULL.
  else 'home_hero'
end
where placement is null;

alter table public.landing_banners alter column placement set default 'home_promo';
alter table public.ads alter column placement set default 'home_hero';

alter table public.landing_banners alter column placement set not null;
alter table public.ads alter column placement set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'landing_banners_placement_check'
  ) then
    alter table public.landing_banners
      add constraint landing_banners_placement_check check (placement in (
        'header_strip', 'footer_leaderboard', 'sticky_bottom',
        'home_hero', 'home_top_strip', 'home_promo', 'home_between_sections',
        'listing_top', 'listing_grid', 'detail_sidebar', 'blog_inline'
      ));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'ads_placement_check'
  ) then
    alter table public.ads
      add constraint ads_placement_check check (placement in (
        'header_strip', 'footer_leaderboard', 'sticky_bottom',
        'home_hero', 'home_top_strip', 'home_promo', 'home_between_sections',
        'listing_top', 'listing_grid', 'detail_sidebar', 'blog_inline'
      ));
  end if;
end
$$;

create index if not exists landing_banners_placement_idx
  on public.landing_banners (placement, active, sort_order);

create index if not exists ads_placement_idx
  on public.ads (placement, status, start_at, end_at);

comment on column public.landing_banners.placement is
  'Where this banner renders. Values come from BANNER_PLACEMENTS in src/lib/banner-placements.ts (contract C12).';
comment on column public.ads.placement is
  'Where this ad renders. Values come from BANNER_PLACEMENTS in src/lib/banner-placements.ts (contract C12). Supersedes the unconstrained `position` column.';
