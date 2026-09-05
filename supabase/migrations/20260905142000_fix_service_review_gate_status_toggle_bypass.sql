-- Security fix (S1, SECURITY_AUDIT.md 2026-09-05 fourth-pass): the C14 review
-- gate (prevent_unreviewed_public_content_update) unconditionally skipped its
-- reviewable-field check whenever OLD.status <> 'active' on
-- properties/services/organizations. That was meant to leave a listing's
-- very first submission (status='pending', never yet approved) freely
-- editable pre-review. But `services` separately allows the owner to
-- self-toggle status between active/draft/blocked on an ALREADY-approved
-- listing (20260705150000, a legitimate feature). Chaining the two:
-- active -> draft (allowed) -> edit any reviewable field while status='draft'
-- (review check skipped, since draft <> active) -> draft -> active (allowed
-- again) let a service owner publish fully unreviewed content with zero
-- content_change_requests row and zero admin visibility.
--
-- Narrow the skip to OLD.status = 'pending' specifically: a row that has
-- never been approved (still pending its first admin review) stays freely
-- editable, but any status the owner reaches AFTER a prior approval (active,
-- draft, blocked) keeps the review gate engaged. Admin-initiated resets back
-- to 'pending' (e.g. "send back for revision") still leave the row freely
-- editable until the admin approves it again, which is correct. `properties`
-- and `organizations` are not currently self-toggleable by their owners, so
-- this is a no-op there today and pure hardening against the same bypass
-- shape if that ever changes.
--
-- Live-verified (rolled forward, no rollback needed): as the owning,
-- non-admin user, active -> draft succeeded, editing `title` while draft was
-- BLOCKED (42501) post-fix, and draft -> active succeeded — the legitimate
-- R1 self-toggle still works and the S1 bypass is closed.
CREATE OR REPLACE FUNCTION public.prevent_unreviewed_public_content_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_changed text[];
  v_reviewable text[];
BEGIN
  IF auth.role() IS NULL OR auth.role() = 'service_role' OR public.is_admin_user() THEN
    RETURN NEW;
  END IF;
  IF TG_TABLE_NAME IN ('properties', 'services', 'organizations')
     AND coalesce(to_jsonb(OLD) ->> 'status', '') = 'pending' THEN
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
$function$;
