-- Restore the product contract overwritten by the 2026-07-23 security
-- remediation: renters may see an active cleaning listing they own themselves
-- and may create a task for it. The service row is still required to be active,
-- and the caller must still own the selected property.

drop function if exists public.get_platform_cleaners();
create function public.get_platform_cleaners()
returns table (
  service_id uuid,
  cleaner_id uuid,
  name text,
  avatar_url text,
  price numeric,
  price_unit text,
  location text,
  photo text,
  is_online boolean
)
language sql stable security definer
set search_path = public, pg_temp
as $$
  select s.id,
         s.owner_id,
         coalesce(
           nullif(btrim(concat_ws(' ', cp.first_name, cp.last_name)), ''),
           s.provider_name,
           p.display_name
         ),
         p.avatar_url,
         s.price,
         s.price_unit,
         s.location,
         s.photos[1],
         coalesce(cp.is_online, true)
  from public.services s
  join public.profiles p on p.id = s.owner_id
  left join public.cleaner_profiles cp on cp.id = s.owner_id
  where s.category = 'cleaning'
    and s.status = 'active';
$$;

revoke all on function public.get_platform_cleaners() from public, anon;
grant execute on function public.get_platform_cleaners() to authenticated;

create or replace function public.create_cleaning_task(
  p_property_id uuid,
  p_cleaner_service_id uuid,
  p_cleaning_type text,
  p_scheduled_at timestamptz,
  p_notes text default null
) returns public.cleaning_tasks
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_task public.cleaning_tasks;
  v_cleaner uuid;
  v_price numeric;
  v_owner uuid;
begin
  if auth.uid() is null
    or p_scheduled_at < now()
    or length(btrim(p_cleaning_type)) not between 1 and 80
  then
    raise exception 'Invalid cleaning task' using errcode = '22023';
  end if;

  select owner_id into v_owner
  from public.properties
  where id = p_property_id;
  if v_owner is null or v_owner <> auth.uid() then
    raise exception 'Property not owned by caller' using errcode = '42501';
  end if;

  select owner_id, price into v_cleaner, v_price
  from public.services
  where id = p_cleaner_service_id
    and category = 'cleaning'
    and status = 'active';
  if v_cleaner is null then
    raise exception 'Cleaner unavailable' using errcode = '22023';
  end if;

  insert into public.cleaning_tasks (
    property_id, owner_id, cleaner_id, cleaning_type, scheduled_at, price, notes
  ) values (
    p_property_id, v_owner, v_cleaner, btrim(p_cleaning_type),
    p_scheduled_at, v_price, left(p_notes, 1000)
  ) returning * into v_task;
  return v_task;
end;
$$;

revoke all on function public.create_cleaning_task(uuid, uuid, text, timestamptz, text)
  from public, anon;
grant execute on function public.create_cleaning_task(uuid, uuid, text, timestamptz, text)
  to authenticated;

notify pgrst, 'reload schema';
