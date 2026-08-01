-- Owner SMS automation: lock fixed timing, enforce rental-only preference access,
-- and persist the guest's immediate marketing opt-out through self-service.

update public.sms_automation_rules
set check_in_reminder_hours_before = 24,
    review_request_hours_after = 24,
    win_back_days_after = 90;

alter table public.sms_automation_rules
  drop constraint if exists sms_automation_check_in_window,
  drop constraint if exists sms_automation_review_window,
  drop constraint if exists sms_automation_win_back_window;
alter table public.sms_automation_rules
  add constraint sms_automation_check_in_fixed
    check (check_in_reminder_hours_before = 24),
  add constraint sms_automation_review_fixed
    check (review_request_hours_after = 24),
  add constraint sms_automation_win_back_fixed
    check (win_back_days_after = 90);

drop policy if exists "sms_automation_owner_select" on public.sms_automation_rules;
create policy "sms_automation_owner_select"
  on public.sms_automation_rules for select
  using (
    auth.uid() = user_id
    and exists (
      select 1 from public.properties p
      where p.owner_id = auth.uid()
        and coalesce(p.is_for_sale, false) = false
    )
  );

-- Browser writes are deliberately disabled. The guarded Next API is the only
-- owner writer; service_role and the admin policy remain available.
drop policy if exists "sms_automation_owner_insert" on public.sms_automation_rules;
drop policy if exists "sms_automation_owner_update" on public.sms_automation_rules;

create or replace function public.self_service_update_profile(
  p_actor_id uuid,
  p_values jsonb
) returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_profile public.profiles%rowtype;
  v_cleaner public.cleaner_profiles%rowtype;
  v_key text;
  v_allowed text[] := array[
    'display_name','phone','avatar_url','profile_type','personal_id',
    'whatsapp_enabled','notification_prefs','marketing_opt_out','cleaner_profile'
  ];
  v_profile_values jsonb;
  v_cleaner_values jsonb;
  v_set text;
begin
  if p_actor_id is null or jsonb_typeof(p_values) <> 'object' then
    raise exception 'invalid_self_service_profile_payload' using errcode = '22023';
  end if;
  if not exists (select 1 from public.profiles where id = p_actor_id) then
    raise exception 'profile_not_found' using errcode = 'P0002';
  end if;
  for v_key in select jsonb_object_keys(p_values) loop
    if not v_key = any(v_allowed) then
      raise exception 'self_service_profile_field_not_allowed: %', v_key using errcode = '42501';
    end if;
  end loop;
  if p_values ? 'profile_type'
    and (p_values ->> 'profile_type') not in ('personal', 'company') then
    raise exception 'invalid_profile_type' using errcode = '22023';
  end if;
  if p_values ? 'marketing_opt_out'
    and jsonb_typeof(p_values -> 'marketing_opt_out') <> 'boolean' then
    raise exception 'invalid_marketing_opt_out' using errcode = '22023';
  end if;
  if p_values ? 'notification_prefs' then
    if jsonb_typeof(p_values -> 'notification_prefs') <> 'object'
       or exists (
         select 1 from jsonb_object_keys(p_values -> 'notification_prefs') k
         where k not in ('new_request', 'add_favorite', 'monthly_report')
       )
       or exists (
         select 1 from jsonb_each(p_values -> 'notification_prefs') e
         where jsonb_typeof(e.value) <> 'boolean'
       ) then
      raise exception 'invalid_notification_prefs' using errcode = '22023';
    end if;
  end if;
  if p_values ? 'cleaner_profile' and (
    jsonb_typeof(p_values -> 'cleaner_profile') <> 'object' or exists (
      select 1 from jsonb_object_keys(p_values -> 'cleaner_profile') k
      where k not in ('first_name','last_name','personal_number','address','phone','whatsapp')
    )
  ) then
    raise exception 'invalid_cleaner_profile' using errcode = '22023';
  end if;

  v_profile_values := p_values - 'cleaner_profile';
  if v_profile_values ? 'notification_prefs' then
    select notification_prefs into v_profile_values
      from public.profiles where id = p_actor_id for update;
    v_profile_values := (p_values - array['cleaner_profile','notification_prefs'])
      || jsonb_build_object('notification_prefs',
        coalesce(v_profile_values, '{}'::jsonb) || (p_values -> 'notification_prefs'));
  end if;
  select string_agg(format('%1$I = (jsonb_populate_record(NULL::public.profiles, $1)).%1$I', k), ', ')
    into v_set
  from jsonb_object_keys(v_profile_values) k
  where k = any(array[
    'display_name','phone','avatar_url','profile_type','personal_id',
    'whatsapp_enabled','notification_prefs','marketing_opt_out'
  ]);
  if v_set is not null then
    execute format('update public.profiles set %s where id = $2 returning *', v_set)
      into v_profile using v_profile_values, p_actor_id;
  else
    select * into v_profile from public.profiles where id = p_actor_id;
  end if;

  if p_values ? 'cleaner_profile' then
    v_cleaner_values := p_values -> 'cleaner_profile';
    insert into public.cleaner_profiles(id) values (p_actor_id) on conflict (id) do nothing;
    select string_agg(format('%1$I = (jsonb_populate_record(NULL::public.cleaner_profiles, $1)).%1$I', k), ', ')
      into v_set
    from jsonb_object_keys(v_cleaner_values) k
    where k = any(array['first_name','last_name','personal_number','address','phone','whatsapp']);
    if v_set is not null then
      execute format('update public.cleaner_profiles set %s where id = $2 returning *', v_set)
        into v_cleaner using v_cleaner_values, p_actor_id;
    end if;
  end if;
  return jsonb_build_object('profile', to_jsonb(v_profile), 'cleaner_profile', to_jsonb(v_cleaner));
end;
$$;

revoke all on function public.self_service_update_profile(uuid,jsonb)
  from public, anon, authenticated;
grant execute on function public.self_service_update_profile(uuid,jsonb)
  to service_role;

notify pgrst, 'reload schema';
