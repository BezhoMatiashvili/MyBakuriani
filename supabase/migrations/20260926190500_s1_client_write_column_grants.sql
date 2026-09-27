-- Security hardening S1 (2026-09-26): give the API roles column-level write grants
-- on the four client-facing tables and remove all client write access to bookings,
-- so a browser session (or a stolen anon/user JWT) can only send the columns a
-- create/edit form legitimately sends. Closes D2, D4/S05, D5 and S06.
--
-- Background. anon and authenticated held table-wide INSERT/UPDATE/DELETE/TRUNCATE
-- on profiles/properties/services/bookings; op-specific triggers guarded only a
-- handful of columns. So a crafted PATCH/POST could self-grant profiles.is_verified
-- and rating (S05, unguarded because the verification lock is UPDATE-only), rewrite
-- properties.is_b2b_partner / admin_notes and services.rating / reviews_count / is_new
-- (D4/D5), and forge bookings rows to fire the calendar-block / renter-guest / SMS
-- machinery (D2). The fix follows C34/C25: replace the table grant with the exact
-- union of columns each user-session write site sends (derived from the create/edit
-- forms + the register wizard; see the S1 evidence file), and drop bookings entirely
-- as a client writer (nothing inserts bookings from a session — the online booking
-- flow does not exist; manual bookings go through SECURITY DEFINER RPCs).
--
-- GRANT UPDATE (role) on profiles is deliberate: the register wizard's 23505 retry
-- re-applies only role, and prevent_profile_role_change makes that a no-op unless the
-- role actually changed. SELECT grants are untouched (C25: anon keeps its column-level
-- SELECT subset on profiles). properties/services INSERT still name status (and
-- properties organization_id) because the forms send them; force_listing_moderation_state
-- neutralises those on insert. No VIP/discount/trust/counter column is granted.
--
-- S06: prevent_listing_protected_field_change locked a service's status only when it
-- left 'pending'. Admin takedown sets status = 'blocked', so an owner could PATCH it
-- back to active and re-list a banned service. The trigger now locks any owner move
-- away from 'blocked' too (admin / service_role stay exempt), so active<->draft and
-- active->blocked self-unpublish keep working. Body regenerated from the live
-- definition so the 171100 [counters] guards survive unchanged.
--
-- security_posture_snapshot() gains a client_write_grants key so check-db-contracts
-- (C34) can assert this posture mechanically.
--
-- REVOKE precedes the column GRANTs: revoking the table-level privilege first is what
-- makes has_table_privilege() report false, leaving only the column grants in effect.

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.profiles, public.properties, public.services, public.bookings FROM anon;

REVOKE TRUNCATE ON public.profiles, public.properties, public.services, public.bookings FROM authenticated;

REVOKE INSERT, UPDATE ON public.profiles, public.properties, public.services FROM authenticated;

GRANT INSERT (id, phone, display_name, bio, avatar_url, role) ON public.profiles TO authenticated;

GRANT UPDATE (role) ON public.profiles TO authenticated;

GRANT INSERT (owner_id, type, title, description, location, location_lat, location_lng, cadastral_code, cadastral_code_public, area_sqm, rooms, bathrooms, capacity, price_per_night, sale_price, amenities, photos, house_rules, min_booking_days, is_for_sale, status, organization_id, developer, roi_percent, roi_percent_max, renovation_status, construction_status, construction_progress_percent, completion_year, units_total, units_sold, units_reserved, construction_stages, phone, whatsapp) ON public.properties TO authenticated;

GRANT UPDATE (cadastral_code_public, organization_id) ON public.properties TO authenticated;

GRANT INSERT (owner_id, category, status, title, description, position, location, employment_type, salary_type, salary_min, salary_max, salary_daily, salary_range, accommodation, meals, requirements, languages, experience_required, activity_type, activity_category, duration, age_min, good_for, safety_notes, price, price_unit, schedule, operating_hours, coords, photos, phone, whatsapp, restaurant_type, cuisine_type, avg_check, menu_url, has_kids_area, has_lounge, has_delivery, has_live_music, provider_name, service_field, driver_name, vehicle_make, transport_type, vehicle_capacity, vehicle_color, routes, route_pricing, equipment, features) ON public.services TO authenticated;

GRANT UPDATE (status) ON public.services TO authenticated;

DROP POLICY IF EXISTS "Guests can create bookings" ON public.bookings;

DROP POLICY IF EXISTS "Participants can update bookings" ON public.bookings;

REVOKE INSERT, UPDATE, DELETE ON public.bookings FROM authenticated;

CREATE OR REPLACE FUNCTION public.prevent_listing_protected_field_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  caller_role text;
  status_changed boolean;
  status_locked boolean;
  org_changed boolean := false;
  counters_changed boolean;
BEGIN
  status_changed := NEW.status::text IS DISTINCT FROM OLD.status::text;
  -- [counters] views_count is written only by record_listing_view (service
  -- role, C22); an owner PATCH must not be able to fake popularity.
  counters_changed := NEW.views_count IS DISTINCT FROM OLD.views_count;

  IF TG_TABLE_NAME = 'services' THEN
    -- Block leaving 'pending' (the self-approval bypass) AND leaving 'blocked'
    -- (S06): an admin takedown sets status = 'blocked'; without this an owner
    -- could PATCH it straight back to active/draft and re-list a banned service.
    -- Owners may still toggle active<->draft and self-unpublish active->blocked.
    status_locked := status_changed AND OLD.status::text IN ('pending', 'blocked');
    -- [counters] menu_views_count exists only on `services`; keep the
    -- reference inside this branch so it is never resolved against `properties`.
    counters_changed := counters_changed
      OR NEW.menu_views_count IS DISTINCT FROM OLD.menu_views_count;
  ELSE
    status_locked := status_changed;
  END IF;

  -- organization_id exists only on `properties`. Keep the reference inside this
  -- branch so it is never resolved against the `services` rowtype.
  IF TG_TABLE_NAME = 'properties' THEN
    org_changed := NEW.organization_id IS DISTINCT FROM OLD.organization_id;
    -- The row owner may attach/detach their own listing to/from a company;
    -- enforce_org_listing_rules still validates approved membership + active
    -- subscription + listing cap on every attach.
    IF org_changed
       AND OLD.owner_id = auth.uid()
       AND NEW.owner_id IS NOT DISTINCT FROM OLD.owner_id THEN
      org_changed := false;
    END IF;
  END IF;

  IF NOT status_locked
     AND NEW.is_vip IS NOT DISTINCT FROM OLD.is_vip
     AND NEW.is_super_vip IS NOT DISTINCT FROM OLD.is_super_vip
     AND NEW.discount_percent IS NOT DISTINCT FROM OLD.discount_percent
     AND NEW.vip_expires_at IS NOT DISTINCT FROM OLD.vip_expires_at
     AND NEW.discount_expires_at IS NOT DISTINCT FROM OLD.discount_expires_at
     AND NEW.owner_id IS NOT DISTINCT FROM OLD.owner_id
     AND NOT org_changed
     AND NOT counters_changed
  THEN
    RETURN NEW;
  END IF;

  BEGIN
    caller_role := auth.role();
  EXCEPTION WHEN OTHERS THEN
    caller_role := NULL;
  END;

  IF caller_role IS NULL OR caller_role = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF public.is_admin_user() THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION
    'Changing status/is_vip/is_super_vip/discount_percent/vip_expires_at/discount_expires_at/owner_id/organization_id/views_count/menu_views_count is not permitted from a non-admin user session'
    USING ERRCODE = '42501';
END;
$function$;

CREATE OR REPLACE FUNCTION public.security_posture_snapshot()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'writable_views', COALESCE((
      SELECT jsonb_agg(DISTINCT c.relname)
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      CROSS JOIN (VALUES ('anon'), ('authenticated')) AS r(role_name)
      WHERE n.nspname = 'public' AND c.relkind IN ('v', 'm')
        AND (has_table_privilege(r.role_name, c.oid, 'INSERT')
          OR has_table_privilege(r.role_name, c.oid, 'UPDATE')
          OR has_table_privilege(r.role_name, c.oid, 'DELETE'))
    ), '[]'::jsonb),
    'anon_definer_functions', COALESCE((
      SELECT jsonb_agg(p.oid::regprocedure::text ORDER BY p.oid::regprocedure::text)
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.prosecdef
        AND has_function_privilege('anon', p.oid, 'EXECUTE')
    ), '[]'::jsonb),
    'public_definer_functions', COALESCE((
      SELECT jsonb_agg(p.oid::regprocedure::text ORDER BY p.oid::regprocedure::text)
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.prosecdef
        AND has_function_privilege('public', p.oid, 'EXECUTE')
    ), '[]'::jsonb),
    'rls_disabled_tables', COALESCE((
      SELECT jsonb_agg(c.relname ORDER BY c.relname)
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') AND NOT c.relrowsecurity
    ), '[]'::jsonb),
    'default_acl', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'role', pg_get_userbyid(d.defaclrole),
        'schema', COALESCE(dn.nspname, '*'),
        'objtype', d.defaclobjtype::text,
        'acl', d.defaclacl::text))
      FROM pg_default_acl d
      LEFT JOIN pg_namespace dn ON dn.oid = d.defaclnamespace
      WHERE pg_get_userbyid(d.defaclrole) = 'postgres'
        AND (d.defaclnamespace = 0 OR dn.nspname = 'public')
    ), '[]'::jsonb),
    -- C34/S1: per-role write posture on the four client-facing tables. Table-level
    -- booleans come from has_table_privilege (table ACL only); the column arrays
    -- list columns holding a COLUMN-level grant to the role or to PUBLIC (grantee 0),
    -- read from pg_attribute.attacl via aclexplode (information_schema.column_privileges
    -- expands table grants to every column and would over-report). SELECT grants are
    -- intentionally not surfaced.
    'client_write_grants', COALESCE((
      SELECT jsonb_object_agg(t.tbl, t.per_role)
      FROM (
        SELECT c.relname AS tbl, jsonb_object_agg(r.role_name, jsonb_build_object(
          'insert', has_table_privilege(r.role_name, c.oid, 'INSERT'),
          'update', has_table_privilege(r.role_name, c.oid, 'UPDATE'),
          'delete', has_table_privilege(r.role_name, c.oid, 'DELETE'),
          'truncate', has_table_privilege(r.role_name, c.oid, 'TRUNCATE'),
          'insert_columns', COALESCE((
            SELECT jsonb_agg(DISTINCT a.attname ORDER BY a.attname)
            FROM pg_attribute a, aclexplode(a.attacl) ae
            WHERE a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
              AND ae.grantee IN (r.role_name::regrole::oid, 0) AND ae.privilege_type = 'INSERT'
          ), '[]'::jsonb),
          'update_columns', COALESCE((
            SELECT jsonb_agg(DISTINCT a.attname ORDER BY a.attname)
            FROM pg_attribute a, aclexplode(a.attacl) ae
            WHERE a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
              AND ae.grantee IN (r.role_name::regrole::oid, 0) AND ae.privilege_type = 'UPDATE'
          ), '[]'::jsonb)
        )) AS per_role
        FROM pg_class c
        CROSS JOIN (VALUES ('anon'::name), ('authenticated'::name)) AS r(role_name)
        WHERE c.oid IN ('public.profiles'::regclass, 'public.properties'::regclass,
                        'public.services'::regclass, 'public.bookings'::regclass)
        GROUP BY c.relname, c.oid
      ) t
    ), '{}'::jsonb)
  );
$$;

REVOKE ALL ON FUNCTION public.security_posture_snapshot() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.security_posture_snapshot() TO service_role;

