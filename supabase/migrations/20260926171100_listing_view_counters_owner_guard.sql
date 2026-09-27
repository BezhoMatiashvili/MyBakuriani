-- Listing view counters are analytics, not owner content (C22): views_count is
-- written only by record_listing_view and menu_views_count only by
-- increment_service_menu_views, both through the service role. Owners held
-- column UPDATE and INSERT on both (table grants + owner RLS) and
-- audit_row_change treats them as noise, so a PATCH or an INSERT could fake
-- popularity with no trace. Both bodies are regenerated from the live
-- definitions (pg_get_functiondef); only the lines tagged [counters] are new.
-- service_role / admin / NULL-role callers still bypass both triggers.

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
    -- Only block leaving 'pending' (the self-approval bypass); owners can
    -- freely toggle active/draft/blocked on an already-moderated listing.
    status_locked := status_changed AND OLD.status::text = 'pending';
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
$function$
;

CREATE OR REPLACE FUNCTION public.force_listing_moderation_state()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
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
  -- services has is_super_vip too. Resetting it only for properties let an
  -- owner insert a service that became a permanent (NULL-expiry) SUPER VIP
  -- once approved, since every reader treats a NULL expiry as active.
  NEW.is_super_vip := false;
  NEW.discount_percent := 0;
  NEW.discount_expires_at := NULL;
  NEW.vip_expires_at := NULL;
  NEW.vip_expiry_notified_at := NULL;
  -- [counters] a new listing starts unviewed; an owner cannot seed its
  -- counters (views_count on both tables, menu_views_count on services).
  NEW.views_count := 0;
  IF TG_TABLE_NAME = 'properties' THEN
    NEW.organization_id := NULL;
  END IF;
  -- [counters] menu_views_count exists only on `services`.
  IF TG_TABLE_NAME = 'services' THEN
    NEW.menu_views_count := 0;
  END IF;
  RETURN NEW;
END;
$function$
;
