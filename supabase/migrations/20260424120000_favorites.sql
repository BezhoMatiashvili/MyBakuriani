create table public.favorites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  property_id uuid references public.properties(id) on delete cascade,
  service_id uuid references public.services(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint favorites_exactly_one_ref check (
    (property_id is not null)::int + (service_id is not null)::int = 1
  )
);

create unique index favorites_user_property_unique
  on public.favorites (user_id, property_id)
  where property_id is not null;

create unique index favorites_user_service_unique
  on public.favorites (user_id, service_id)
  where service_id is not null;

create index favorites_user_idx on public.favorites (user_id);

alter table public.favorites enable row level security;

create policy "users read own favorites"
  on public.favorites for select
  using (auth.uid() = user_id);

create policy "users insert own favorites"
  on public.favorites for insert
  with check (auth.uid() = user_id);

create policy "users delete own favorites"
  on public.favorites for delete
  using (auth.uid() = user_id);
