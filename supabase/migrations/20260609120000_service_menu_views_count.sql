alter table public.services
  add column if not exists menu_views_count integer not null default 0;

create or replace function public.increment_service_menu_views(p_service_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.services
  set menu_views_count = menu_views_count + 1
  where id = p_service_id and status = 'active';
$$;

grant execute on function public.increment_service_menu_views(uuid) to anon, authenticated;
