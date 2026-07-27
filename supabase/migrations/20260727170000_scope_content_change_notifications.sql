-- Route content-change outcomes to the requester's cabinet.
--
-- The three notifications approve_content_change_request writes (superseded /
-- rejected / approved) carried no dashboard_scope, so since 20260727130000 a
-- renter or seller never saw the result of their own edit request in any
-- cabinet feed -- only in the global /notifications inbox. Same defect class as
-- the payment_success scope bug fixed in 20260727160000.
--
-- NOTE: the three sibling inserts inside 20260727143000's one-shot DO block are
-- deliberately NOT touched. That block already executed against the pending
-- queue; there is no function to redefine, and this repo never rewrites an
-- applied migration.
--
-- The whole body below is copied verbatim from
-- 20260724180000_content_change_requests.sql -- CREATE OR REPLACE swaps the
-- entire definition, so the cleaner_profile jsonb projection and the
-- unique_violation handler must survive intact.

CREATE OR REPLACE FUNCTION public.approve_content_change_request(
  p_request_id uuid,
  p_admin_id uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
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
  -- Resolved once, from PRE-apply state: the superseded insert fires inside the
  -- diff loop below, and the rejected insert fires from the EXCEPTION handler
  -- after the statement already rolled back, so pre-state is the only state
  -- available to all three call sites.
  --
  -- 'profile' deliberately resolves to NULL (global). A profile edit is
  -- account-wide, and a user routinely holds several cabinets at once, so any
  -- single pick would drop the notice into a cabinet they may never open.
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
    -- Project the cleaner row onto exactly the keys the request snapshotted. The
    -- submit API stores before_snapshot.cleaner_profile as the 6 allow-listed
    -- fields, so comparing it against the full row below would ALWAYS be distinct
    -- (jsonb object equality needs identical key sets) and every cleaner request
    -- would auto-supersede. Projecting also keeps the cleaner's own is_online
    -- toggle from invalidating a pending request.
    SELECT to_jsonb(cp) INTO v_cleaner FROM public.cleaner_profiles cp WHERE cp.id = r.target_id;
    v_cleaner := coalesce(v_cleaner, '{}'::jsonb);
    -- Guard on jsonb TYPE, not nullness: `coalesce` does not catch a JSON `null`, and
    -- jsonb_object_keys on a scalar raises 22023, which would wedge the request as
    -- permanently unapprovable (and keep occupying the one-pending-per-target slot).
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
    WHEN 'profile' THEN ARRAY['display_name','phone','avatar_url','bio','response_time_minutes']
    WHEN 'property' THEN ARRAY['type','title','description','location','location_lat','location_lng','cadastral_code','area_sqm','rooms','bathrooms','capacity','price_per_night','sale_price','currency','amenities','photos','house_rules','min_booking_days','is_for_sale','roi_percent','roi_percent_max','construction_status','developer','cleaning_fee','renovation_status','hotel_stars','numeric_rating','room_type','distance_to_slope_m','phone','whatsapp','completion_year','units_total','units_sold','units_reserved','construction_stages','construction_progress_percent','construction_image_url']
    WHEN 'service' THEN ARRAY['category','title','description','price','price_unit','currency','photos','location','schedule','phone','whatsapp','driver_name','vehicle_capacity','route','cuisine_type','has_delivery','operating_hours','menu','position','salary_range','experience_required','employment_schedule','provider_name','service_field','languages','vehicle_make','transport_type','vehicle_color','routes','route_pricing','equipment','features','menu_url','activity_type','activity_category','duration','age_min','good_for','coords','restaurant_type','avg_check','meals','accommodation','has_kids_area','has_live_music','has_lounge','employment_type','requirements','salary_daily','salary_min','salary_max','salary_type','work_schedule','safety_notes']
    WHEN 'organization' THEN ARRAY['legal_name','brand_name','company_type','logo_url','cover_url','phone','website','city','address','location_lat','location_lng']
  END;
  SELECT string_agg(format('%1$I = (jsonb_populate_record(NULL::public.%2$I, $1)).%1$I', k, v_table), ', ')
    INTO v_set
  FROM jsonb_object_keys(r.proposed_values) k WHERE k = ANY(v_allowed);
  -- The submit API validates field NAMES but not values, while these columns carry
  -- real constraints (profiles.phone UNIQUE, properties.cadastral_code UNIQUE, the
  -- Georgian phone-format triggers, NOT NULLs, enum casts). Without this handler a
  -- violation aborts the whole RPC, the admin route returns a raw 500, and the request
  -- stays 'pending' forever — holding the one-pending-per-target slot and making the
  -- listing uneditable. Reject it with the SQLSTATE instead, and tell the requester.
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
$$;
