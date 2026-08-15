-- Older protected-column triggers recognized an admin by profile role alone.
-- That allowed an AAL1 admin to use owner/member update policies on their own
-- rows and bypass the application's MFA gate. Keep trusted service_role/direct
-- database behavior unchanged, but route every JWT-admin exception through the
-- AAL2-aware is_admin_user() guard.

do $migration$
declare
  v_name text;
  v_oid oid;
  v_definition text;
  v_hardened text;
begin
  foreach v_name in array array[
    'prevent_admin_role_self_insert',
    'prevent_booking_protected_field_change',
    'prevent_cleaning_task_protected_field_change',
    'prevent_listing_protected_field_change',
    'prevent_profile_role_change',
    'prevent_profile_verification_self_grant',
    'prevent_smart_match_offer_identity_change'
  ]
  loop
    select p.oid
      into v_oid
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = v_name
      and pg_get_function_identity_arguments(p.oid) = '';

    if v_oid is null then
      raise exception 'Expected trigger function public.%() is missing', v_name;
    end if;

    v_definition := pg_get_functiondef(v_oid);
    v_hardened := replace(
      v_definition,
      'IF EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = ''admin'') THEN',
      'IF public.is_admin_user() THEN'
    );
    v_hardened := replace(
      v_hardened,
      E'IF EXISTS (\n    SELECT 1 FROM public.profiles\n    WHERE id = auth.uid() AND role = ''admin''\n  ) THEN',
      'IF public.is_admin_user() THEN'
    );

    if v_hardened = v_definition
       or v_hardened ilike '%where id = auth.uid() and role = ''admin''%' then
      raise exception 'Could not safely harden public.%()', v_name;
    end if;

    execute v_hardened;
  end loop;

  select p.oid
    into v_oid
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'sms_capture_sale_price_drop'
    and pg_get_function_identity_arguments(p.oid) = '';

  if v_oid is null then
    raise exception 'Expected trigger function public.sms_capture_sale_price_drop() is missing';
  end if;

  v_definition := pg_get_functiondef(v_oid);
  v_hardened := replace(
    v_definition,
    'auth.role() = ''service_role'' or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = ''admin'')',
    'auth.role() = ''service_role'' or public.is_admin_user()'
  );

  if v_hardened = v_definition
     or v_hardened ilike '%p.role = ''admin''%' then
    raise exception 'Could not safely harden public.sms_capture_sale_price_drop()';
  end if;

  execute v_hardened;
end
$migration$;
