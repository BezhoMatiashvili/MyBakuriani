-- Landing banners: admin-managed promotional content for the public site.
-- Supports three kinds of banners:
--   info       — slim notification strip on the landing page (orange info banner)
--   promo      — large card with image + CTA on the landing page (favourite service style)
--   sticky_news — fixed bar pinned to the bottom of every public page
--
-- Public reads only see active rows within the optional schedule window.
-- Only admins may create/update/delete.

create type public.landing_banner_kind as enum ('info', 'promo', 'sticky_news');

create table if not exists public.landing_banners (
  id uuid primary key default gen_random_uuid(),
  kind public.landing_banner_kind not null,
  title text not null,
  body text,
  cta_label text,
  cta_href text,
  image_url text,
  -- Visual tone: 'orange' | 'amber' | 'blue' | 'green' | 'red' | 'slate'.
  -- Maps to a small set of curated colour pairs in the client so admins
  -- don't have to deal with raw hex.
  tone text not null default 'orange',
  active boolean not null default true,
  -- Optional schedule window; null means "no bound on that side".
  start_at timestamptz,
  end_at timestamptz,
  sort_order int not null default 0,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists landing_banners_kind_active_idx
  on public.landing_banners (kind, active, sort_order);

-- Keep updated_at fresh.
create or replace function public.tg_landing_banners_touch()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists landing_banners_touch on public.landing_banners;
create trigger landing_banners_touch
before update on public.landing_banners
for each row execute function public.tg_landing_banners_touch();

alter table public.landing_banners enable row level security;

-- Anyone (even anon) can read banners that are active and within the window.
drop policy if exists "landing_banners read active" on public.landing_banners;
create policy "landing_banners read active"
  on public.landing_banners
  for select
  using (
    active = true
    and (start_at is null or start_at <= now())
    and (end_at is null or end_at >= now())
  );

-- Admins can read everything (including inactive/scheduled) so the dashboard
-- list reflects truth.
drop policy if exists "landing_banners admin read all" on public.landing_banners;
create policy "landing_banners admin read all"
  on public.landing_banners
  for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

drop policy if exists "landing_banners admin write" on public.landing_banners;
create policy "landing_banners admin write"
  on public.landing_banners
  for all
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );
