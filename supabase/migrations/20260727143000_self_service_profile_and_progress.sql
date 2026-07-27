-- Immediate, authenticated self-service writes.  These functions are intentionally
-- narrower than the editorial-review trigger: they are invoked only by server routes
-- with the verified actor id and never grant browser clients direct write access.

CREATE OR REPLACE FUNCTION public.self_service_update_profile(
  p_actor_id uuid,
  p_values jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_profile public.profiles%ROWTYPE;
  v_cleaner public.cleaner_profiles%ROWTYPE;
  v_key text;
  v_allowed text[] := ARRAY[
    'display_name','phone','avatar_url','profile_type','personal_id',
    'whatsapp_enabled','notification_prefs','cleaner_profile'
  ];
  v_profile_values jsonb;
  v_cleaner_values jsonb;
  v_set text;
BEGIN
  IF p_actor_id IS NULL OR jsonb_typeof(p_values) <> 'object' THEN
    RAISE EXCEPTION 'invalid_self_service_profile_payload' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_actor_id) THEN
    RAISE EXCEPTION 'profile_not_found' USING ERRCODE = 'P0002';
  END IF;
  FOR v_key IN SELECT jsonb_object_keys(p_values) LOOP
    IF NOT v_key = ANY(v_allowed) THEN
      RAISE EXCEPTION 'self_service_profile_field_not_allowed: %', v_key USING ERRCODE = '42501';
    END IF;
  END LOOP;
  IF p_values ? 'profile_type'
    AND (p_values ->> 'profile_type') NOT IN ('personal', 'company') THEN
    RAISE EXCEPTION 'invalid_profile_type' USING ERRCODE = '22023';
  END IF;
  IF p_values ? 'notification_prefs' THEN
    IF jsonb_typeof(p_values -> 'notification_prefs') <> 'object'
       OR EXISTS (
         SELECT 1 FROM jsonb_object_keys(p_values -> 'notification_prefs') k
         WHERE k NOT IN ('new_request', 'add_favorite', 'monthly_report')
       )
       OR EXISTS (
         SELECT 1 FROM jsonb_each(p_values -> 'notification_prefs') e
         WHERE jsonb_typeof(e.value) <> 'boolean'
       ) THEN
      RAISE EXCEPTION 'invalid_notification_prefs' USING ERRCODE = '22023';
    END IF;
  END IF;
  IF p_values ? 'cleaner_profile' AND (
    jsonb_typeof(p_values -> 'cleaner_profile') <> 'object' OR EXISTS (
      SELECT 1 FROM jsonb_object_keys(p_values -> 'cleaner_profile') k
      WHERE k NOT IN ('first_name','last_name','personal_number','address','phone','whatsapp')
    )
  ) THEN
    RAISE EXCEPTION 'invalid_cleaner_profile' USING ERRCODE = '22023';
  END IF;

  v_profile_values := p_values - 'cleaner_profile';
  IF v_profile_values ? 'notification_prefs' THEN
    SELECT notification_prefs INTO v_profile_values
      FROM public.profiles WHERE id = p_actor_id FOR UPDATE;
    v_profile_values := (p_values - ARRAY['cleaner_profile','notification_prefs'])
      || jsonb_build_object('notification_prefs',
        coalesce(v_profile_values, '{}'::jsonb) || (p_values -> 'notification_prefs'));
  END IF;
  SELECT string_agg(format('%1$I = (jsonb_populate_record(NULL::public.profiles, $1)).%1$I', k), ', ')
    INTO v_set
  FROM jsonb_object_keys(v_profile_values) k
  WHERE k = ANY(ARRAY['display_name','phone','avatar_url','profile_type','personal_id','whatsapp_enabled','notification_prefs']);
  IF v_set IS NOT NULL THEN
    EXECUTE format('UPDATE public.profiles SET %s WHERE id = $2 RETURNING *', v_set)
      INTO v_profile USING v_profile_values, p_actor_id;
  ELSE
    SELECT * INTO v_profile FROM public.profiles WHERE id = p_actor_id;
  END IF;

  IF p_values ? 'cleaner_profile' THEN
    v_cleaner_values := p_values -> 'cleaner_profile';
    INSERT INTO public.cleaner_profiles(id) VALUES (p_actor_id) ON CONFLICT (id) DO NOTHING;
    SELECT string_agg(format('%1$I = (jsonb_populate_record(NULL::public.cleaner_profiles, $1)).%1$I', k), ', ')
      INTO v_set
    FROM jsonb_object_keys(v_cleaner_values) k
    WHERE k = ANY(ARRAY['first_name','last_name','personal_number','address','phone','whatsapp']);
    IF v_set IS NOT NULL THEN
      EXECUTE format('UPDATE public.cleaner_profiles SET %s WHERE id = $2 RETURNING *', v_set)
        INTO v_cleaner USING v_cleaner_values, p_actor_id;
    END IF;
  END IF;
  RETURN jsonb_build_object('profile', to_jsonb(v_profile), 'cleaner_profile', to_jsonb(v_cleaner));
END;
$$;
REVOKE ALL ON FUNCTION public.self_service_update_profile(uuid,jsonb) FROM PUBLIC, anon, authenticated;
-- The calling API route holds the service key (createServiceClient), so PostgREST
-- executes this as service_role. Without an explicit grant the REVOKE above also
-- denies the intended caller and every self-service save 42501s.
GRANT EXECUTE ON FUNCTION public.self_service_update_profile(uuid,jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.self_service_publish_property_progress(
  p_actor_id uuid,
  p_property_id uuid,
  p_stages text[],
  p_status text DEFAULT NULL,
  p_note text DEFAULT NULL,
  p_photos text[] DEFAULT '{}',
  p_video_url text DEFAULT NULL,
  p_update_date date DEFAULT current_date
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_property public.properties%ROWTYPE;
  v_stages text[];
  v_percent smallint;
  v_update public.project_updates%ROWTYPE;
  v_allowed text[] := ARRAY['permit','earthworks','foundation','rc_frame','walls','roofing','windows_doors','utilities','finishing','commissioning'];
BEGIN
  IF p_actor_id IS NULL OR p_property_id IS NULL OR p_stages IS NULL
     OR (p_status IS NOT NULL AND p_status NOT IN ('on_schedule','delayed','paused','completed'))
     OR coalesce(array_length(p_photos, 1), 0) > 5
     OR char_length(coalesce(p_note, '')) > 1000 THEN
    RAISE EXCEPTION 'invalid_progress_payload' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_property FROM public.properties WHERE id = p_property_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'property_not_found' USING ERRCODE = 'P0002'; END IF;
  IF v_property.owner_id <> p_actor_id AND NOT EXISTS (
    SELECT 1 FROM public.organization_members m
    WHERE m.organization_id = v_property.organization_id
      AND m.user_id = p_actor_id AND m.status = 'approved'
  ) THEN
    RAISE EXCEPTION 'property_progress_forbidden' USING ERRCODE = '42501';
  END IF;
  IF EXISTS (SELECT 1 FROM unnest(p_stages) s WHERE s IS NULL OR NOT s = ANY(v_allowed)) THEN
    RAISE EXCEPTION 'invalid_construction_stage' USING ERRCODE = '22023';
  END IF;
  -- De-dupe and normalize into the single canonical stage order.
  SELECT coalesce(array_agg(s ORDER BY array_position(v_allowed, s)), '{}'::text[])
    INTO v_stages
  FROM (SELECT DISTINCT unnest(p_stages) AS s) stages;
  SELECT coalesce(sum(weight), 0)::smallint INTO v_percent
  FROM (VALUES ('permit',5),('earthworks',5),('foundation',10),('rc_frame',25),('walls',12),('roofing',10),('windows_doors',8),('utilities',10),('finishing',10),('commissioning',5)) weights(stage, weight)
  WHERE stage = ANY(v_stages);

  UPDATE public.properties SET
    construction_stages = v_stages,
    construction_progress_percent = v_percent,
    progress_note = CASE WHEN nullif(btrim(p_note), '') IS NULL THEN progress_note ELSE btrim(p_note) END,
    progress_note_updated_at = CASE WHEN nullif(btrim(p_note), '') IS NULL THEN progress_note_updated_at ELSE now() END
  WHERE id = p_property_id RETURNING * INTO v_property;
  INSERT INTO public.project_updates(property_id, owner_id, status, note, photos, video_url, update_date)
  VALUES (p_property_id, v_property.owner_id, p_status, nullif(btrim(p_note), ''), coalesce(p_photos, '{}'::text[]), nullif(btrim(p_video_url), ''), coalesce(p_update_date, current_date))
  RETURNING * INTO v_update;
  RETURN jsonb_build_object('property', to_jsonb(v_property), 'project_update', to_jsonb(v_update));
END;
$$;
REVOKE ALL ON FUNCTION public.self_service_publish_property_progress(uuid,uuid,text[],text,text,text[],text,date) FROM PUBLIC, anon, authenticated;
-- Same reasoning as self_service_update_profile above: service_role is the only
-- intended caller and needs the grant back after the blanket REVOKE.
GRANT EXECUTE ON FUNCTION public.self_service_publish_property_progress(uuid,uuid,text[],text,text,text[],text,date) TO service_role;

-- Resolve the specifically safe legacy requests during this deployment. Mixed
-- property requests retain their non-progress fields for ordinary moderation.
DO $$
DECLARE r record; v_current jsonb; v_cleaner jsonb; v_progress jsonb; v_remaining jsonb; v_before jsonb; v_progress_before jsonb;
BEGIN
  FOR r IN SELECT * FROM public.content_change_requests WHERE status = 'pending' LOOP
    IF r.target_type = 'profile'
       AND NOT EXISTS (SELECT 1 FROM jsonb_object_keys(r.proposed_values) k WHERE k NOT IN ('display_name','phone','avatar_url','profile_type','personal_id','whatsapp_enabled','notification_prefs','cleaner_profile'))
       AND (NOT (r.proposed_values ? 'cleaner_profile') OR (
         jsonb_typeof(r.proposed_values -> 'cleaner_profile') = 'object' AND NOT EXISTS (
           SELECT 1 FROM jsonb_object_keys(r.proposed_values -> 'cleaner_profile') k
           WHERE k NOT IN ('first_name','last_name','personal_number','address','phone','whatsapp')
         )
       )) THEN
      SELECT to_jsonb(p) INTO v_current FROM public.profiles p WHERE p.id = r.target_id;
      IF v_current IS NULL THEN
        UPDATE public.content_change_requests SET status = 'superseded', reviewed_at = now(), rejection_reason = 'resave_required_self_service' WHERE id = r.id;
        INSERT INTO public.notifications(user_id,type,title,message,action_url) VALUES (r.requester_id,'content_change_superseded','ცვლილება ვადაგასულია','პარამეტრები შეიცვალა. გთხოვთ, ხელახლა შეინახოთ.','/dashboard');
        CONTINUE;
      END IF;
      IF r.proposed_values ? 'cleaner_profile' THEN
        SELECT coalesce(jsonb_object_agg(k, to_jsonb(cp) -> k), '{}'::jsonb) INTO v_cleaner
        FROM public.cleaner_profiles cp,
          jsonb_object_keys(CASE WHEN jsonb_typeof(r.before_snapshot -> 'cleaner_profile') = 'object'
            THEN r.before_snapshot -> 'cleaner_profile' ELSE '{}'::jsonb END) k
        WHERE cp.id = r.target_id;
        v_current := coalesce(v_current, '{}'::jsonb) || jsonb_build_object('cleaner_profile', coalesce(v_cleaner, '{}'::jsonb));
      END IF;
      IF v_current IS NOT NULL AND NOT EXISTS (SELECT 1 FROM jsonb_object_keys(r.before_snapshot) k WHERE (r.before_snapshot -> k) IS DISTINCT FROM (v_current -> k)) THEN
        PERFORM public.self_service_update_profile(r.requester_id, r.proposed_values);
        UPDATE public.content_change_requests SET status = 'approved', reviewed_at = now(), rejection_reason = 'automatically_applied_self_service' WHERE id = r.id;
      ELSE
        UPDATE public.content_change_requests SET status = 'superseded', reviewed_at = now(), rejection_reason = 'resave_required_self_service' WHERE id = r.id;
        INSERT INTO public.notifications(user_id,type,title,message,action_url) VALUES (r.requester_id,'content_change_superseded','ცვლილება ვადაგასულია','პარამეტრები შეიცვალა. გთხოვთ, ხელახლა შეინახოთ.','/dashboard');
      END IF;
    ELSIF r.target_type = 'property' AND (r.proposed_values ? 'construction_stages' OR r.proposed_values ? 'construction_progress_percent') THEN
      SELECT to_jsonb(p) INTO v_current FROM public.properties p WHERE p.id = r.target_id;
      SELECT coalesce(jsonb_object_agg(k, r.proposed_values -> k), '{}'::jsonb) INTO v_progress
      FROM jsonb_object_keys(r.proposed_values) k
      WHERE k IN ('construction_stages','construction_progress_percent');
      v_remaining := r.proposed_values - ARRAY['construction_stages','construction_progress_percent'];
      v_before := r.before_snapshot - ARRAY['construction_stages','construction_progress_percent'];
      SELECT coalesce(jsonb_object_agg(k, r.before_snapshot -> k), '{}'::jsonb) INTO v_progress_before
      FROM jsonb_object_keys(r.before_snapshot) k
      WHERE k IN ('construction_stages','construction_progress_percent');
      IF v_current IS NULL
        OR EXISTS (SELECT 1 FROM jsonb_object_keys(v_before) k WHERE (v_before -> k) IS DISTINCT FROM (v_current -> k))
        OR EXISTS (SELECT 1 FROM jsonb_object_keys(v_progress_before) k WHERE (v_progress_before -> k) IS DISTINCT FROM (v_current -> k)) THEN
        UPDATE public.content_change_requests SET status = 'superseded', reviewed_at = now(), rejection_reason = 'resave_required_self_service' WHERE id = r.id;
        INSERT INTO public.notifications(user_id,type,title,message,action_url) VALUES (r.requester_id,'content_change_superseded','ცვლილება ვადაგასულია','კონტენტი შეიცვალა. გთხოვთ, ხელახლა შეინახოთ.','/dashboard');
      ELSIF v_remaining = '{}'::jsonb THEN
        PERFORM public.self_service_publish_property_progress(r.requester_id, r.target_id,
          CASE WHEN jsonb_typeof(v_progress -> 'construction_stages') = 'array'
            THEN ARRAY(SELECT jsonb_array_elements_text(v_progress -> 'construction_stages'))
            ELSE ARRAY(SELECT stage FROM (VALUES ('permit',5),('earthworks',10),('foundation',20),('rc_frame',45),('walls',57),('roofing',67),('windows_doors',75),('utilities',85),('finishing',95),('commissioning',100)) w(stage, pct) WHERE pct <= coalesce((v_progress ->> 'construction_progress_percent')::int, 0)) END);
        UPDATE public.content_change_requests SET status = 'approved', reviewed_at = now(), rejection_reason = 'automatically_applied_self_service' WHERE id = r.id;
      ELSE
        -- Apply only the stage portion, then leave the remainder pending with a fresh
        -- baseline so the normal admin queue can still review it.
        PERFORM public.self_service_publish_property_progress(r.requester_id, r.target_id,
          CASE WHEN jsonb_typeof(v_progress -> 'construction_stages') = 'array'
            THEN ARRAY(SELECT jsonb_array_elements_text(v_progress -> 'construction_stages'))
            ELSE ARRAY(SELECT stage FROM (VALUES ('permit',5),('earthworks',10),('foundation',20),('rc_frame',45),('walls',57),('roofing',67),('windows_doors',75),('utilities',85),('finishing',95),('commissioning',100)) w(stage, pct) WHERE pct <= coalesce((v_progress ->> 'construction_progress_percent')::int, 0)) END);
        UPDATE public.content_change_requests SET proposed_values = v_remaining,
          before_snapshot = (SELECT jsonb_object_agg(k, v_current -> k) FROM jsonb_object_keys(v_remaining) k),
          -- Restrict to keys the original diff actually carried: without the WHERE,
          -- every remaining key the diff lacked is written back as a JSON null and
          -- the admin review screen (the only approval surface) chokes on it. The
          -- coalesce is then load-bearing — the WHERE can match zero rows, and a
          -- bare NULL would violate the column's NOT NULL and abort this migration.
          field_diff = coalesce(
            (SELECT jsonb_object_agg(k, r.field_diff -> k)
             FROM jsonb_object_keys(v_remaining) k
             WHERE r.field_diff ? k),
            '{}'::jsonb)
          WHERE id = r.id;
      END IF;
    END IF;
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
