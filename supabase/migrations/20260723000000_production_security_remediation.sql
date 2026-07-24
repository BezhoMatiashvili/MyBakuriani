-- Production security remediation. Apply only after taking the schema/policy
-- snapshot described in SECURITY_AUDIT.md; this migration is intentionally
-- additive/non-destructive except for cancelling unverified dummy payments.

-- ---------------------------------------------------------------------------
-- Payments: the dummy card processor has been removed from the application.
-- Preserve prior ledger rows but make every pending synthetic intent terminal.
-- ---------------------------------------------------------------------------
UPDATE public.payments
SET status = 'cancelled',
    completed_at = COALESCE(completed_at, now()),
    last_error = 'Payments disabled pending hosted PSP integration'
WHERE status = 'pending';

REVOKE ALL ON FUNCTION public.settle_payment(uuid, uuid, boolean, text, text, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.topup_balance(uuid, numeric, text)
  FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Profiles: remove the last blanket authenticated profile read.  A user can
-- read their own full row; contact details for public listings must be exposed
-- only through the deliberately minimal public_listing_profiles read model.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Authenticated users can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = id);

CREATE OR REPLACE VIEW public.public_listing_profiles
WITH (security_invoker = false)
AS
SELECT
  p.id,
  p.display_name,
  p.avatar_url,
  p.is_verified
FROM public.profiles p
WHERE EXISTS (
  SELECT 1 FROM public.properties pr
  WHERE pr.owner_id = p.id AND pr.status = 'active'
)
OR EXISTS (
  SELECT 1 FROM public.services s
  WHERE s.owner_id = p.id AND s.status = 'active'
);

REVOKE ALL ON public.public_listing_profiles FROM PUBLIC;
GRANT SELECT ON public.public_listing_profiles TO anon, authenticated;

-- Do not grant direct reads of a public row merely because the row is active.
-- Owner/dashboard and administrator policies remain in place; anonymous cards
-- and search must use the explicit views below.  This is intentionally applied
-- only after the compatible app release has switched every public query.
DROP POLICY IF EXISTS "Active properties are viewable" ON public.properties;
CREATE POLICY "Owners can view own properties" ON public.properties
  FOR SELECT TO authenticated USING (owner_id = (SELECT auth.uid()));
DROP POLICY IF EXISTS "Active services are viewable" ON public.services;
CREATE POLICY "Owners can view own services" ON public.services
  FOR SELECT TO authenticated USING (owner_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "orgs public read active or owner" ON public.organizations;
CREATE POLICY "orgs owner read" ON public.organizations
  FOR SELECT TO authenticated USING (owner_id = (SELECT auth.uid()));

-- ---------------------------------------------------------------------------
-- Notifications are a server/trigger side effect. Clients may only mark their
-- own records read; they must not construct notifications for another user.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Smart match notifications insert" ON public.notifications;
DROP POLICY IF EXISTS "Users can insert notifications" ON public.notifications;
DROP POLICY IF EXISTS "Notifications insert" ON public.notifications;

CREATE OR REPLACE FUNCTION public.prevent_notification_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO public
AS $function$
BEGIN
  IF auth.role() = 'service_role' OR public.is_admin_user() THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE'
     AND NEW.user_id IS NOT DISTINCT FROM OLD.user_id
     AND NEW.is_read IS DISTINCT FROM OLD.is_read
     AND (to_jsonb(NEW) - 'is_read' - 'updated_at') =
         (to_jsonb(OLD) - 'is_read' - 'updated_at')
  THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Notifications are server managed' USING ERRCODE = '42501';
END;
$function$;

DROP TRIGGER IF EXISTS notifications_server_managed ON public.notifications;
CREATE TRIGGER notifications_server_managed
  BEFORE INSERT OR UPDATE OR DELETE ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION public.prevent_notification_mutation();
REVOKE ALL ON FUNCTION public.prevent_notification_mutation() FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Listings: every browser-originated create begins in moderation.  System
-- fields are reset even when a client supplies them. service_role/DB jobs keep
-- their explicit state for migrations, imports and administration.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.force_listing_moderation_state()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO public
AS $function$
BEGIN
  IF auth.role() IS NULL OR auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;
  IF public.is_admin_user() THEN
    RETURN NEW;
  END IF;

  NEW.status := 'pending';
  NEW.is_vip := false;
  NEW.discount_percent := 0;
  NEW.vip_expires_at := NULL;
  IF TG_TABLE_NAME = 'properties' THEN
    NEW.is_super_vip := false;
    NEW.organization_id := NULL;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS properties_force_moderation_on_insert ON public.properties;
CREATE TRIGGER properties_force_moderation_on_insert
  BEFORE INSERT ON public.properties
  FOR EACH ROW EXECUTE FUNCTION public.force_listing_moderation_state();

DROP TRIGGER IF EXISTS services_force_moderation_on_insert ON public.services;
CREATE TRIGGER services_force_moderation_on_insert
  BEFORE INSERT ON public.services
  FOR EACH ROW EXECUTE FUNCTION public.force_listing_moderation_state();
REVOKE ALL ON FUNCTION public.force_listing_moderation_state() FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Reviews: a review is a moderated, immutable consequence of one completed
-- booking. The service role remains able to import historical data.
-- ---------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS reviews_one_per_booking
  ON public.reviews(booking_id) WHERE booking_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.enforce_review_lifecycle()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO public
AS $function$
DECLARE
  v_booking public.bookings%ROWTYPE;
BEGIN
  IF auth.role() IS NULL OR auth.role() = 'service_role' OR public.is_admin_user() THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'Reviews are immutable after submission' USING ERRCODE = '42501';
  END IF;

  IF NEW.guest_id IS DISTINCT FROM auth.uid() OR NEW.booking_id IS NULL THEN
    RAISE EXCEPTION 'A review must belong to the submitting user and booking' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_booking FROM public.bookings WHERE id = NEW.booking_id;
  IF NOT FOUND OR v_booking.guest_id <> auth.uid()
     OR v_booking.property_id <> NEW.property_id OR v_booking.status <> 'completed' THEN
    RAISE EXCEPTION 'Only completed stays may be reviewed' USING ERRCODE = '42501';
  END IF;
  NEW.status := 'pending';
  NEW.moderation_notes := NULL;
  NEW.moderated_by := NULL;
  NEW.moderated_at := NULL;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS reviews_enforce_lifecycle ON public.reviews;
CREATE TRIGGER reviews_enforce_lifecycle
  BEFORE INSERT OR UPDATE ON public.reviews
  FOR EACH ROW EXECUTE FUNCTION public.enforce_review_lifecycle();
REVOKE ALL ON FUNCTION public.enforce_review_lifecycle() FROM PUBLIC, anon, authenticated;

-- Public review reads are explicitly restricted to approved records. The old
-- generic policy otherwise ORed with the new policy and exposed pending rows.
DROP POLICY IF EXISTS "Reviews are viewable" ON public.reviews;
DROP POLICY IF EXISTS "reviews public read approved" ON public.reviews;
CREATE POLICY "Review author/admin reads" ON public.reviews
  FOR SELECT TO authenticated
  USING (guest_id = (SELECT auth.uid()) OR public.is_admin_user());

NOTIFY pgrst, 'reload schema';

-- ---------------------------------------------------------------------------
-- Moderation notes and public listing read models.  Notes never belong on a
-- row readable by a listing owner or anonymous visitor.  The views deliberately
-- list their fields: adding a sensitive base-table column later cannot expose it
-- by accident through public detail/search code.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.property_admin_notes (
  property_id uuid PRIMARY KEY REFERENCES public.properties(id) ON DELETE CASCADE,
  notes text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.service_admin_notes (
  service_id uuid PRIMARY KEY REFERENCES public.services(id) ON DELETE CASCADE,
  notes text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.property_admin_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_admin_notes ENABLE ROW LEVEL SECURITY;

INSERT INTO public.property_admin_notes (property_id, notes)
SELECT id, admin_notes FROM public.properties WHERE admin_notes IS NOT NULL
ON CONFLICT (property_id) DO UPDATE SET notes = EXCLUDED.notes, updated_at = now();
INSERT INTO public.service_admin_notes (service_id, notes)
SELECT id, admin_notes FROM public.services WHERE admin_notes IS NOT NULL
ON CONFLICT (service_id) DO UPDATE SET notes = EXCLUDED.notes, updated_at = now();
-- Keep the legacy columns for this compatibility release.  Several admin
-- editors still use them; removing a column before those callers and generated
-- types have moved to the side tables would turn moderation into a production
-- outage.  A later, separately reviewed lockdown migration may drop them only
-- after the replacement contract is live everywhere.

CREATE OR REPLACE VIEW public.public_properties
WITH (security_invoker = false) AS
SELECT pr.id, pr.type, pr.title, pr.description, pr.location, pr.location_lat, pr.location_lng,
       pr.cadastral_code, pr.area_sqm, pr.rooms, pr.bathrooms, pr.capacity, pr.price_per_night,
       pr.sale_price, pr.currency, pr.amenities, pr.photos, pr.is_vip, pr.is_super_vip, pr.vip_expires_at,
       pr.discount_percent, pr.views_count, pr.house_rules, pr.min_booking_days, pr.is_for_sale,
       pr.roi_percent, pr.construction_status, pr.developer, pr.created_at, pr.updated_at,
       pr.cleaning_fee, pr.distance_to_slope_m, pr.hotel_stars, pr.numeric_rating,
       pr.room_type, pr.is_b2b_partner, pr.renovation_status, pr.completion_year, pr.progress_note,
       pr.progress_note_updated_at, pr.construction_progress_percent, pr.units_total, pr.units_sold,
       pr.units_reserved, pr.construction_stages, pr.registration_readiness, pr.roi_percent_max,
       pr.construction_image_url, pr.organization_id, pr.discount_expires_at,
       p.display_name AS profile_display_name, p.avatar_url AS profile_avatar_url,
       p.is_verified AS profile_is_verified,
       o.brand_name AS organization_brand_name, o.logo_url AS organization_logo_url,
       o.verified_at AS organization_verified_at, o.company_type AS organization_company_type
FROM public.properties pr
LEFT JOIN public.profiles p ON p.id = pr.owner_id
LEFT JOIN public.organizations o ON o.id = pr.organization_id AND o.status = 'active'
WHERE pr.status = 'active' AND (pr.organization_id IS NULL OR o.id IS NOT NULL);

CREATE OR REPLACE VIEW public.public_services
WITH (security_invoker = false) AS
SELECT s.id, s.category, s.title, s.description, s.price, s.price_unit, s.currency, s.photos,
       s.location, s.schedule, s.discount_percent, s.is_vip, s.views_count, s.driver_name,
       s.vehicle_capacity, s.route, s.cuisine_type, s.has_delivery, s.operating_hours, s.menu,
       s.position, s.salary_range, s.experience_required, s.employment_schedule, s.created_at,
       s.updated_at, s.is_new, s.avg_check, s.menu_url, s.has_kids_area, s.has_lounge,
       s.has_live_music, s.employment_type, s.work_schedule, s.salary_type, s.salary_min,
       s.salary_max, s.salary_daily, s.accommodation, s.meals, s.requirements, s.languages,
       s.service_field, s.provider_name, s.rating, s.reviews_count, s.safety_notes, s.activity_type,
       s.activity_category, s.duration, s.age_min, s.good_for, s.coords, s.restaurant_type,
       s.is_super_vip, s.vip_expires_at, s.menu_views_count, s.vehicle_color, s.features,
       s.route_pricing, s.discount_expires_at,
       p.display_name AS profile_display_name, p.avatar_url AS profile_avatar_url,
       p.is_verified AS profile_is_verified
FROM public.services s
LEFT JOIN public.profiles p ON p.id = s.owner_id
WHERE s.status = 'active';
REVOKE ALL ON public.public_properties, public.public_services FROM PUBLIC;
GRANT SELECT ON public.public_properties, public.public_services TO anon, authenticated;

CREATE OR REPLACE VIEW public.public_organizations
WITH (security_invoker = false) AS
SELECT id, brand_name, company_type, logo_url, cover_url, website, city, address,
       location_lat, location_lng, verified_at, created_at
FROM public.organizations
WHERE status = 'active';
REVOKE ALL ON public.public_organizations FROM PUBLIC;
GRANT SELECT ON public.public_organizations TO anon, authenticated;

CREATE OR REPLACE VIEW public.public_reviews
WITH (security_invoker = false) AS
SELECT r.id, r.property_id, r.rating, r.comment, r.created_at,
       p.display_name AS guest_display_name
FROM public.reviews r
LEFT JOIN public.profiles p ON p.id = r.guest_id
WHERE r.status = 'approved';
REVOKE ALL ON public.public_reviews FROM PUBLIC;
GRANT SELECT ON public.public_reviews TO anon, authenticated;

-- Direct RPC calls bypass the Edge endpoint's shared limit and safe response
-- contract.  Counters are now server-only writes and global search is callable
-- only by the rate-limited Edge implementation using service credentials.
REVOKE ALL ON FUNCTION public.global_search(text, text[], integer)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.increment_views(uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.increment_service_menu_views(uuid)
  FROM PUBLIC, anon, authenticated;

-- Contact data is never part of a listing read model.  Reveals are a separate
-- auditable action and this log deliberately stores no phone/WhatsApp value.
CREATE TABLE IF NOT EXISTS public.contact_reveal_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid NOT NULL,
  listing_type text NOT NULL CHECK (listing_type IN ('property','service')),
  account_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  device_id text,
  client_ip text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS contact_reveal_events_listing_idx
  ON public.contact_reveal_events (listing_type, listing_id, created_at DESC);
ALTER TABLE public.contact_reveal_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.contact_reveal_events FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Cleaning is a server-derived workflow.  Neither the selected cleaner nor a
-- quoted price is accepted from a browser write, and transitions are finite.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Owners can create tasks" ON public.cleaning_tasks;
DROP POLICY IF EXISTS "Participants can update tasks" ON public.cleaning_tasks;

CREATE OR REPLACE FUNCTION public.create_cleaning_task(
  p_property_id uuid, p_cleaner_service_id uuid, p_cleaning_type text,
  p_scheduled_at timestamptz, p_notes text DEFAULT NULL
) RETURNS public.cleaning_tasks
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $function$
DECLARE v_task public.cleaning_tasks; v_cleaner uuid; v_price numeric; v_owner uuid;
BEGIN
  IF auth.uid() IS NULL OR p_scheduled_at < now() OR length(btrim(p_cleaning_type)) NOT BETWEEN 1 AND 80 THEN
    RAISE EXCEPTION 'Invalid cleaning task' USING ERRCODE = '22023';
  END IF;
  SELECT owner_id INTO v_owner FROM public.properties WHERE id = p_property_id;
  IF v_owner IS NULL OR v_owner <> auth.uid() THEN RAISE EXCEPTION 'Property not owned by caller' USING ERRCODE = '42501'; END IF;
  SELECT owner_id, price INTO v_cleaner, v_price FROM public.services
  WHERE id = p_cleaner_service_id AND category = 'cleaning' AND status = 'active';
  IF v_cleaner IS NULL OR v_cleaner = v_owner THEN RAISE EXCEPTION 'Cleaner unavailable' USING ERRCODE = '22023'; END IF;
  INSERT INTO public.cleaning_tasks (property_id, owner_id, cleaner_id, cleaning_type, scheduled_at, price, notes)
  VALUES (p_property_id, v_owner, v_cleaner, btrim(p_cleaning_type), p_scheduled_at, v_price, left(p_notes, 1000))
  RETURNING * INTO v_task;
  RETURN v_task;
END;
$function$;

CREATE OR REPLACE FUNCTION public.transition_cleaning_task(p_task_id uuid, p_status text)
RETURNS public.cleaning_tasks
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $function$
DECLARE v_task public.cleaning_tasks; v_next text := lower(btrim(p_status));
BEGIN
  SELECT * INTO v_task FROM public.cleaning_tasks WHERE id = p_task_id FOR UPDATE;
  IF NOT FOUND OR auth.uid() IS NULL THEN RAISE EXCEPTION 'Task not found' USING ERRCODE = '42501'; END IF;
  IF (v_task.owner_id = auth.uid() AND v_task.status = 'pending' AND v_next = 'cancelled')
     OR (v_task.cleaner_id = auth.uid() AND v_task.status = 'pending' AND v_next IN ('accepted','declined'))
     OR (v_task.cleaner_id = auth.uid() AND v_task.status = 'accepted' AND v_next = 'in_progress')
     OR (v_task.cleaner_id = auth.uid() AND v_task.status = 'in_progress' AND v_next = 'completed') THEN
    UPDATE public.cleaning_tasks SET status = v_next,
      started_at = CASE WHEN v_next = 'in_progress' THEN now() ELSE started_at END,
      completed_at = CASE WHEN v_next = 'completed' THEN now() ELSE completed_at END
    WHERE id = v_task.id RETURNING * INTO v_task;
    RETURN v_task;
  END IF;
  RAISE EXCEPTION 'Invalid task transition' USING ERRCODE = '42501';
END;
$function$;
REVOKE ALL ON FUNCTION public.create_cleaning_task(uuid, uuid, text, timestamptz, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.transition_cleaning_task(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_cleaning_task(uuid, uuid, text, timestamptz, text), public.transition_cleaning_task(uuid, text) TO authenticated;

-- Return shape intentionally drops contact fields; PostgreSQL requires a drop
-- before changing a function's OUT-column signature.
DROP FUNCTION IF EXISTS public.get_platform_cleaners();
CREATE FUNCTION public.get_platform_cleaners()
RETURNS TABLE (service_id uuid, cleaner_id uuid, name text, avatar_url text, price numeric,
               price_unit text, location text, photo text, is_online boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $function$
  SELECT s.id, s.owner_id,
         COALESCE(NULLIF(btrim(concat_ws(' ', cp.first_name, cp.last_name)), ''), s.provider_name, p.display_name),
         p.avatar_url, s.price, s.price_unit, s.location, s.photos[1], COALESCE(cp.is_online, true)
  FROM public.services s JOIN public.profiles p ON p.id = s.owner_id
  LEFT JOIN public.cleaner_profiles cp ON cp.id = s.owner_id
  WHERE s.category = 'cleaning' AND s.status = 'active' AND s.owner_id <> auth.uid();
$function$;
REVOKE ALL ON FUNCTION public.get_platform_cleaners() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_platform_cleaners() TO authenticated;

CREATE OR REPLACE FUNCTION public.get_cleaning_task_contact(p_task_id uuid)
RETURNS TABLE (phone text, whatsapp text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $function$
  SELECT COALESCE(cp.phone, s.phone, p.phone), COALESCE(cp.whatsapp, s.whatsapp)
  FROM public.cleaning_tasks t JOIN public.services s ON s.owner_id = t.cleaner_id AND s.category = 'cleaning'
  JOIN public.profiles p ON p.id = t.cleaner_id LEFT JOIN public.cleaner_profiles cp ON cp.id = t.cleaner_id
  WHERE t.id = p_task_id AND auth.uid() IN (t.owner_id, t.cleaner_id)
    AND t.status IN ('accepted','in_progress','completed') LIMIT 1;
$function$;
REVOKE ALL ON FUNCTION public.get_cleaning_task_contact(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_cleaning_task_contact(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- CVs are disabled until malware scanning exists.  Existing documents remain
-- private and can only be issued by a future owner/admin server download path.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "job_applications_public_insert" ON public.job_applications;
DROP POLICY IF EXISTS "job_applications_owner_update" ON public.job_applications;
DROP POLICY IF EXISTS "cv_documents_anyone_insert" ON storage.objects;
DROP POLICY IF EXISTS "cv_documents_owner_select" ON storage.objects;
REVOKE INSERT, UPDATE, DELETE ON public.job_applications FROM anon, authenticated;
UPDATE public.job_applications SET cv_path = NULL WHERE cv_path IS NOT NULL;

-- Quarantine receives only a short-lived signed upload created by the server.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('media-quarantine', 'media-quarantine', false, 10485760, ARRAY['image/jpeg','image/png','image/webp'])
ON CONFLICT (id) DO UPDATE SET public = false, file_size_limit = 10485760,
  allowed_mime_types = EXCLUDED.allowed_mime_types;
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('service-photos', 'service-photos', true, 10485760, ARRAY['image/jpeg','image/png','image/webp'])
ON CONFLICT (id) DO UPDATE SET public = true, file_size_limit = 10485760,
  allowed_mime_types = EXCLUDED.allowed_mime_types;
CREATE TABLE IF NOT EXISTS public.media_upload_intents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), owner_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  listing_id uuid NOT NULL, listing_type text NOT NULL CHECK (listing_type IN ('property','service')),
  quarantine_path text NOT NULL UNIQUE, content_type text NOT NULL, expected_bytes integer NOT NULL CHECK (expected_bytes BETWEEN 1 AND 10485760),
  expires_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','scanning','approved','rejected','expired')),
  scanner_verdict jsonb,
  finalized_at timestamptz,
  canonical_path text,
  canonical_url text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.media_upload_intents ENABLE ROW LEVEL SECURITY;
-- no client policies: all creation/finalization is a server service-role action.
-- The legacy browser-upload policies are removed by the *final lockdown*
-- migration, after every create/edit/admin/avatar/menu/CV caller uses upload
-- intents and legacy objects have been rescanned.  Revoking them here would
-- break currently deployed create forms before the compatible release lands.

CREATE INDEX IF NOT EXISTS media_upload_intents_expiry_idx
  ON public.media_upload_intents (expires_at) WHERE status IN ('pending','scanning');

CREATE OR REPLACE FUNCTION public.expire_media_upload_intents()
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $function$
DECLARE v_count integer;
BEGIN
  UPDATE public.media_upload_intents
  SET status = 'expired'
  WHERE status IN ('pending','scanning') AND expires_at < now();
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$function$;
REVOKE ALL ON FUNCTION public.expire_media_upload_intents() FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';
