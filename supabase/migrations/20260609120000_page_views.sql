-- Lightweight first-party visit tracking. One row per client-side page view.
-- Powers the admin dashboard "ვიზიტორები" (total visits), "უნიკალური ვიზიტები"
-- (unique devices) and "რეგისტრირებული ვიზიტორები" (logged-in users who used
-- the site) metrics. Data accumulates from deploy onward — no historical backfill.

create table if not exists public.page_views (
  id uuid primary key default gen_random_uuid(),
  visitor_id text not null,                                  -- anonymous device id (mb_vid cookie)
  user_id uuid references public.profiles(id) on delete set null,
  path text,
  created_at timestamptz not null default now()
);

create index if not exists page_views_created_at_idx on public.page_views (created_at);
create index if not exists page_views_visitor_id_idx on public.page_views (visitor_id);

-- RLS on, no policies: only the service_role (used by the /api/track/view insert
-- and the admin stats RPC) can read or write. Least privilege — ordinary clients
-- never touch this table directly.
alter table public.page_views enable row level security;
