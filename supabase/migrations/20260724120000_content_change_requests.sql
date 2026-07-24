-- Editorial review for edits to already-approved public profiles and listings.
-- New listing inserts continue to use the existing listing moderation queue.

CREATE TABLE IF NOT EXISTS public.content_change_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  target_type text NOT NULL CHECK (target_type IN ('profile', 'property', 'service', 'organization')),
  target_id uuid NOT NULL,
  before_snapshot jsonb NOT NULL,
  proposed_values jsonb NOT NULL,
  field_diff jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'withdrawn', 'superseded')),
  rejection_reason text,
  reviewed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  withdrawn_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT content_change_rejection_reason
    CHECK (status <> 'rejected' OR nullif(btrim(rejection_reason), '') IS NOT NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS content_change_one_pending_target
  ON public.content_change_requests(target_type, target_id)
  WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS content_change_requests_queue_idx
  ON public.content_change_requests(status, created_at DESC);
CREATE INDEX IF NOT EXISTS content_change_requests_requester_idx
  ON public.content_change_requests(requester_id, created_at DESC);

ALTER TABLE public.content_change_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Content-change requesters read own" ON public.content_change_requests;
DROP POLICY IF EXISTS "Content-change admins manage" ON public.content_change_requests;
CREATE POLICY "Content-change requesters read own" ON public.content_change_requests
  FOR SELECT TO authenticated
  USING (requester_id = (select auth.uid()) OR (select public.is_admin_user()));
CREATE POLICY "Content-change admins manage" ON public.content_change_requests
  FOR ALL TO authenticated
  USING ((select public.is_admin_user()))
  WITH CHECK ((select public.is_admin_user()));

CREATE OR REPLACE FUNCTION public.set_content_change_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END;
$$;
DROP TRIGGER IF EXISTS set_content_change_requests_updated_at ON public.content_change_requests;
CREATE TRIGGER set_content_change_requests_updated_at
  BEFORE UPDATE ON public.content_change_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_content_change_updated_at();
REVOKE ALL ON FUNCTION public.set_content_change_updated_at() FROM PUBLIC, anon, authenticated;

-- Browser sessions may keep operational controls immediate, but cannot directly
-- mutate public content after creation. Server/admin writes and initial INSERTs
-- retain their existing behaviour.
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
  -- Only already-public rows are review-gated, per this migration's stated scope. A
  -- listing that was never published (status 'pending', or rejected/blocked by
  -- moderation) must stay correctable in place: that is what the listing moderation
  -- queue is for, and double-queueing it would make it uncorrectable, since approving
  -- a content change never touches `status`. Read `status` out of to_jsonb(OLD) rather
  -- than OLD.status: this one function is attached to profiles and cleaner_profiles
  -- too, and those tables have no such column (a direct OLD.status reference would
  -- raise 42703 there).
  IF TG_TABLE_NAME IN ('properties', 'services', 'organizations')
     AND coalesce(to_jsonb(OLD) ->> 'status', '') <> 'active' THEN
    RETURN NEW;
  END IF;
  v_reviewable := CASE TG_TABLE_NAME
    WHEN 'profiles' THEN ARRAY['display_name','phone','avatar_url','bio','response_time_minutes']
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

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['profiles','cleaner_profiles','properties','services','organizations'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS prevent_unreviewed_public_content_update ON public.%I', t);
    EXECUTE format('CREATE TRIGGER prevent_unreviewed_public_content_update BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.prevent_unreviewed_public_content_update()', t);
  END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.prevent_unreviewed_public_content_update() FROM PUBLIC, anon, authenticated;

-- This function is called only by the MFA-protected admin route with a
-- service-role client. It locks the request, protects against stale snapshots,
-- then applies exactly the submitted allowlisted columns in one transaction.
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
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_admin_id AND role = 'admin') THEN
    RAISE EXCEPTION 'admin_required' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO r FROM public.content_change_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'request_not_found' USING ERRCODE = 'P0002'; END IF;
  IF r.status <> 'pending' THEN RAISE EXCEPTION 'request_not_pending' USING ERRCODE = 'P0001'; END IF;

  v_table := CASE r.target_type WHEN 'profile' THEN 'profiles' WHEN 'property' THEN 'properties' WHEN 'service' THEN 'services' WHEN 'organization' THEN 'organizations' END;
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
      INSERT INTO public.notifications(user_id,type,title,message,action_url)
        VALUES (r.requester_id,'content_change_superseded','ცვლილება ვადაგასულია','კონტენტი შეიცვალა მოთხოვნის განხილვამდე. გთხოვთ, ხელახლა გაგზავნოთ.','/dashboard');
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
    INSERT INTO public.notifications(user_id,type,title,message,action_url)
      VALUES (r.requester_id,'content_change_rejected','ცვლილება ვერ გამოქვეყნდა','შეყვანილი მონაცემები ვერ შეინახა (შესაძლოა ნომერი ან საკადასტრო კოდი უკვე გამოყენებულია). გთხოვთ, შეასწოროთ და ხელახლა გაგზავნოთ.','/dashboard');
    RETURN jsonb_build_object('status', 'rejected', 'reason', 'apply_failed', 'sqlstate', SQLSTATE);
  END;

  UPDATE public.content_change_requests
  SET status = 'approved', reviewed_by = p_admin_id, reviewed_at = now(), rejection_reason = NULL
  WHERE id = r.id;
  INSERT INTO public.notifications(user_id,type,title,message,action_url)
    VALUES (r.requester_id,'content_change_approved','ცვლილება დამტკიცდა','თქვენი საჯარო კონტენტის ცვლილება დამტკიცდა.','/dashboard');
  RETURN jsonb_build_object('status', 'approved', 'target_type', r.target_type, 'target_id', r.target_id);
END;
$$;
REVOKE ALL ON FUNCTION public.approve_content_change_request(uuid,uuid) FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_audit_content_change_requests ON public.content_change_requests;
CREATE TRIGGER trg_audit_content_change_requests
  AFTER INSERT OR UPDATE OR DELETE ON public.content_change_requests
  FOR EACH ROW EXECUTE FUNCTION public.audit_row_change();

INSERT INTO storage.buckets (id, name, public)
VALUES ('content-change-media', 'content-change-media', false)
ON CONFLICT (id) DO UPDATE SET public = false;
DROP POLICY IF EXISTS "Change-media owner upload" ON storage.objects;
DROP POLICY IF EXISTS "Change-media owner preview" ON storage.objects;
DROP POLICY IF EXISTS "Change-media owner remove" ON storage.objects;
CREATE POLICY "Change-media owner upload" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'content-change-media' AND (storage.foldername(name))[1] = (select auth.uid())::text);
CREATE POLICY "Change-media owner preview" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'content-change-media' AND ((storage.foldername(name))[1] = (select auth.uid())::text OR (select public.is_admin_user())));
CREATE POLICY "Change-media owner remove" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'content-change-media' AND ((storage.foldername(name))[1] = (select auth.uid())::text OR (select public.is_admin_user())));

NOTIFY pgrst, 'reload schema';
