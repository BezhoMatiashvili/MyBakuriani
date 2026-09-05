-- Product decision (2026-09-05): display_name/phone/avatar_url on `profiles`
-- are formally excluded from the C14 admin-review gate. They were listed as
-- reviewable in the original migration, but self_service_update_profile
-- (added 3 days later) has been the ONLY wired path for editing them in every
-- dashboard since; the review queue for these 3 fields has never actually
-- been reachable from any UI. Rather than build out a "submit for review,
-- wait for approval" flow for basic identity fields (a large UX change),
-- users keep instant self-editing -- matching normal consumer-platform
-- behavior -- and the review gate for `profiles` now only covers `bio` and
-- `response_time_minutes` (genuinely editorial/marketing copy). In exchange,
-- self_service_update_profile gains real server-side validation it never had
-- (display_name length, phone format via the existing sms_canonical_ge_phone
-- helper) as a lightweight guardrail against the impersonation/junk-data risk
-- the review gate used to (nominally, unreachably) cover.

CREATE OR REPLACE FUNCTION public.prevent_unreviewed_public_content_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_changed text[];
  v_reviewable text[];
BEGIN
  IF auth.role() IS NULL OR auth.role() = 'service_role' OR public.is_admin_user() THEN
    RETURN NEW;
  END IF;
  IF TG_TABLE_NAME IN ('properties', 'services', 'organizations')
     AND coalesce(to_jsonb(OLD) ->> 'status', '') <> 'active' THEN
    RETURN NEW;
  END IF;
  v_reviewable := CASE TG_TABLE_NAME
    -- display_name/phone/avatar_url deliberately excluded: self_service_update_profile
    -- is their only wired edit path and always runs as service_role (see above).
    WHEN 'profiles' THEN ARRAY['bio','response_time_minutes']
    WHEN 'cleaner_profiles' THEN ARRAY['first_name','last_name','personal_number','address','phone','whatsapp']
    WHEN 'properties' THEN ARRAY[
      'type','title','description','location','location_lat','location_lng','cadastral_code','area_sqm','rooms','bathrooms','capacity','price_per_night','sale_price','currency','amenities','photos','house_rules','min_booking_days','is_for_sale','roi_percent','roi_percent_max','construction_status','developer','cleaning_fee','renovation_status','hotel_stars','numeric_rating','room_type','distance_to_slope_m','phone','whatsapp','completion_year','units_total','units_sold','units_reserved','construction_stages','construction_progress_percent','construction_image_url'
    ]
    WHEN 'services' THEN ARRAY[
      'category','title','description','price','price_unit','currency','photos','location','schedule','phone','whatsapp','driver_name','vehicle_capacity','route','cuisine_type','has_delivery','operating_hours','menu','position','salary_range','experience_required','employment_schedule','provider_name','service_field','languages','vehicle_make','transport_type','vehicle_color','routes','route_pricing','equipment','features','menu_url','activity_type','activity_category','duration','age_min','good_for','coords','restaurant_type','avg_check','meals','accommodation','has_kids_area','has_live_music','has_lounge','employment_type','requirements','salary_daily','salary_min','salary_max','salary_type','work_schedule','safety_notes'
    ]
    WHEN 'organizations' THEN ARRAY['legal_name','brand_name','company_type','logo_url','cover_url','phone','website','city','address','location_lat','location_lng']
    ELSE ARRAY[]::text[]
  END;
  SELECT array_agg(k) INTO v_changed
  FROM jsonb_object_keys(to_jsonb(NEW)) AS k
  WHERE (to_jsonb(OLD) -> k) IS DISTINCT FROM (to_jsonb(NEW) -> k);
  IF EXISTS (SELECT 1 FROM unnest(coalesce(v_changed, ARRAY[]::text[])) k WHERE k = ANY(v_reviewable)) THEN
    RAISE EXCEPTION 'Public content changes must be submitted for admin review'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.approve_content_change_request(
  p_request_id uuid,
  p_admin_id uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  r public.content_change_requests%ROWTYPE;
  v_current jsonb;
  v_key text;
  v_table text;
  v_allowed text[];
  v_set text;
  v_cleaner jsonb;
  v_scope text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_admin_id AND role = 'admin') THEN
    RAISE EXCEPTION 'admin_required' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO r FROM public.content_change_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'request_not_found' USING ERRCODE = 'P0002'; END IF;
  IF r.status <> 'pending' THEN RAISE EXCEPTION 'request_not_pending' USING ERRCODE = 'P0001'; END IF;

  v_table := CASE r.target_type WHEN 'profile' THEN 'profiles' WHEN 'property' THEN 'properties' WHEN 'service' THEN 'services' WHEN 'organization' THEN 'organizations' END;
  v_scope := CASE r.target_type
    WHEN 'property' THEN (SELECT CASE WHEN coalesce(p.is_for_sale, false) THEN 'seller' ELSE 'renter' END
                            FROM public.properties p WHERE p.id = r.target_id)
    WHEN 'service' THEN (SELECT CASE s.category
                                  WHEN 'food' THEN 'food' WHEN 'cleaning' THEN 'cleaner'
                                  WHEN 'employment' THEN 'employment' WHEN 'transport' THEN 'transport'
                                  WHEN 'entertainment' THEN 'entertainment' ELSE 'services' END
                            FROM public.services s WHERE s.id = r.target_id)
    WHEN 'organization' THEN 'seller'
    ELSE NULL END;
  EXECUTE format('SELECT to_jsonb(t) FROM public.%I t WHERE id = $1', v_table) INTO v_current USING r.target_id;
  IF r.target_type = 'profile' THEN
    SELECT to_jsonb(cp) INTO v_cleaner FROM public.cleaner_profiles cp WHERE cp.id = r.target_id;
    v_cleaner := coalesce(v_cleaner, '{}'::jsonb);
    SELECT coalesce(jsonb_object_agg(k, v_cleaner -> k), '{}'::jsonb) INTO v_cleaner
      FROM jsonb_object_keys(
        CASE WHEN jsonb_typeof(r.before_snapshot -> 'cleaner_profile') = 'object'
             THEN r.before_snapshot -> 'cleaner_profile'
             ELSE '{}'::jsonb END
      ) k;
    v_current := coalesce(v_current, '{}'::jsonb) || jsonb_build_object('cleaner_profile', v_cleaner);
  END IF;
  IF v_current IS NULL THEN
    UPDATE public.content_change_requests SET status = 'superseded', reviewed_by = p_admin_id, reviewed_at = now()
      WHERE id = r.id;
    RETURN jsonb_build_object('status', 'superseded', 'reason', 'target_missing');
  END IF;
  FOR v_key IN SELECT jsonb_object_keys(r.before_snapshot) LOOP
    IF (r.before_snapshot -> v_key) IS DISTINCT FROM (v_current -> v_key) THEN
      UPDATE public.content_change_requests SET status = 'superseded', reviewed_by = p_admin_id, reviewed_at = now()
        WHERE id = r.id;
      INSERT INTO public.notifications(user_id,type,title,message,action_url,dashboard_scope)
        VALUES (r.requester_id,'content_change_superseded','ცვლილება ვადაგასულია','კონტენტი შეიცვალა მოთხოვნის განხილვამდე. გთხოვთ, ხელახლა გაგზავნოთ.','/dashboard',v_scope);
      RETURN jsonb_build_object('status', 'superseded', 'reason', 'stale');
    END IF;
  END LOOP;

  v_allowed := CASE r.target_type
    -- display_name/phone/avatar_url removed: they no longer go through review
    -- (see prevent_unreviewed_public_content_update), so the submit API can no
    -- longer create a pending request naming them; this stays in lock-step.
    WHEN 'profile' THEN ARRAY['bio','response_time_minutes']
    WHEN 'property' THEN ARRAY['type','title','description','location','location_lat','location_lng','cadastral_code','area_sqm','rooms','bathrooms','capacity','price_per_night','sale_price','currency','amenities','photos','house_rules','min_booking_days','is_for_sale','roi_percent','roi_percent_max','construction_status','developer','cleaning_fee','renovation_status','hotel_stars','numeric_rating','room_type','distance_to_slope_m','phone','whatsapp','completion_year','units_total','units_sold','units_reserved','construction_stages','construction_progress_percent','construction_image_url']
    WHEN 'service' THEN ARRAY['category','title','description','price','price_unit','currency','photos','location','schedule','phone','whatsapp','driver_name','vehicle_capacity','route','cuisine_type','has_delivery','operating_hours','menu','position','salary_range','experience_required','employment_schedule','provider_name','service_field','languages','vehicle_make','transport_type','vehicle_color','routes','route_pricing','equipment','features','menu_url','activity_type','activity_category','duration','age_min','good_for','coords','restaurant_type','avg_check','meals','accommodation','has_kids_area','has_live_music','has_lounge','employment_type','requirements','salary_daily','salary_min','salary_max','salary_type','work_schedule','safety_notes']
    WHEN 'organization' THEN ARRAY['legal_name','brand_name','company_type','logo_url','cover_url','phone','website','city','address','location_lat','location_lng']
  END;
  SELECT string_agg(format('%1$I = (jsonb_populate_record(NULL::public.%2$I, $1)).%1$I', k, v_table), ', ')
    INTO v_set
  FROM jsonb_object_keys(r.proposed_values) k WHERE k = ANY(v_allowed);
  BEGIN
    IF v_set IS NOT NULL THEN
      EXECUTE format('UPDATE public.%I SET %s WHERE id = $2', v_table, v_set) USING r.proposed_values, r.target_id;
    END IF;

    IF r.target_type = 'profile' AND jsonb_typeof(r.proposed_values -> 'cleaner_profile') = 'object' THEN
      v_cleaner := r.proposed_values -> 'cleaner_profile';
      INSERT INTO public.cleaner_profiles(id) VALUES (r.target_id) ON CONFLICT (id) DO NOTHING;
      SELECT string_agg(format('%1$I = (jsonb_populate_record(NULL::public.cleaner_profiles, $1)).%1$I', k), ', ')
        INTO v_set
      FROM jsonb_object_keys(v_cleaner) k
      WHERE k = ANY(ARRAY['first_name','last_name','personal_number','address','phone','whatsapp']);
      IF v_set IS NOT NULL THEN
        EXECUTE format('UPDATE public.cleaner_profiles SET %s WHERE id = $2', v_set) USING v_cleaner, r.target_id;
      END IF;
    END IF;
  EXCEPTION WHEN unique_violation OR check_violation OR not_null_violation
    OR invalid_text_representation OR numeric_value_out_of_range OR raise_exception THEN
    UPDATE public.content_change_requests
    SET status = 'rejected', reviewed_by = p_admin_id, reviewed_at = now(),
        rejection_reason = 'apply_failed ' || SQLSTATE || ': ' || SQLERRM
    WHERE id = r.id;
    INSERT INTO public.notifications(user_id,type,title,message,action_url,dashboard_scope)
      VALUES (r.requester_id,'content_change_rejected','ცვლილება ვერ გამოქვეყნდა','შეყვანილი მონაცემები ვერ შეინახა (შესაძლოა ნომერი ან საკადასტრო კოდი უკვე გამოყენებულია). გთხოვთ, შეასწოროთ და ხელახლა გაგზავნოთ.','/dashboard',v_scope);
    RETURN jsonb_build_object('status', 'rejected', 'reason', 'apply_failed', 'sqlstate', SQLSTATE);
  END;

  UPDATE public.content_change_requests
  SET status = 'approved', reviewed_by = p_admin_id, reviewed_at = now(), rejection_reason = NULL
  WHERE id = r.id;
  INSERT INTO public.notifications(user_id,type,title,message,action_url,dashboard_scope)
    VALUES (r.requester_id,'content_change_approved','ცვლილება დამტკიცდა','თქვენი საჯარო კონტენტის ცვლილება დამტკიცდა.','/dashboard',v_scope);
  RETURN jsonb_build_object('status', 'approved', 'target_type', r.target_type, 'target_id', r.target_id);
END;
$function$;

-- Add server-side validation self_service_update_profile never had for the two
-- fields now permanently outside the review gate.
CREATE OR REPLACE FUNCTION public.self_service_update_profile(
  p_actor_id uuid,
  p_values jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
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
BEGIN
  IF p_actor_id is null or jsonb_typeof(p_values) <> 'object' then
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
  if p_values ? 'display_name' and jsonb_typeof(p_values -> 'display_name') <> 'null' then
    if jsonb_typeof(p_values -> 'display_name') <> 'string'
      or length(trim(p_values ->> 'display_name')) = 0
      or length(p_values ->> 'display_name') > 100 then
      raise exception 'invalid_display_name' using errcode = '22023';
    end if;
  end if;
  if p_values ? 'phone' and jsonb_typeof(p_values -> 'phone') <> 'null' then
    if jsonb_typeof(p_values -> 'phone') <> 'string'
      or public.sms_canonical_ge_phone(p_values ->> 'phone') is null then
      raise exception 'invalid_phone' using errcode = '22023';
    end if;
  end if;
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
