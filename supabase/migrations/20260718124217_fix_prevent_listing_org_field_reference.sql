-- Fix: prevent_listing_protected_field_change() referenced NEW.organization_id in a
-- shared boolean guard, but organization_id exists only on `properties`, not `services`.
-- PL/pgSQL resolves NEW.<field> against the row's real tupdesc at execution time (the
-- OR short-circuit does NOT skip the field lookup), so every `services` UPDATE through the
-- `services_lock_protected_fields` trigger raised `record "new" has no field
-- "organization_id"` (SQLSTATE 42703) at the guard IF -- breaking admin approve/reject of
-- service listings AND owner-driven publish/unpublish toggles (food/service/entertainment/
-- transport/employment dashboards). Reference organization_id only inside a properties-only
-- branch so it is never resolved against the `services` rowtype. Behavior is otherwise
-- unchanged: for `services` the old OR-branch was always true; for `properties`
-- `NOT org_changed` is equivalent to the old `IS NOT DISTINCT FROM`.
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
BEGIN
  status_changed := NEW.status::text IS DISTINCT FROM OLD.status::text;

  IF TG_TABLE_NAME = 'services' THEN
    -- Only block leaving 'pending' (the self-approval bypass); owners can
    -- freely toggle active/draft/blocked on an already-moderated listing.
    status_locked := status_changed AND OLD.status::text = 'pending';
  ELSE
    status_locked := status_changed;
  END IF;

  -- organization_id exists only on `properties`. Keep the reference inside this
  -- branch so it is never resolved against the `services` rowtype.
  IF TG_TABLE_NAME = 'properties' THEN
    org_changed := NEW.organization_id IS DISTINCT FROM OLD.organization_id;
  END IF;

  IF NOT status_locked
     AND NEW.is_vip IS NOT DISTINCT FROM OLD.is_vip
     AND NEW.is_super_vip IS NOT DISTINCT FROM OLD.is_super_vip
     AND NEW.discount_percent IS NOT DISTINCT FROM OLD.discount_percent
     AND NEW.vip_expires_at IS NOT DISTINCT FROM OLD.vip_expires_at
     AND NEW.owner_id IS NOT DISTINCT FROM OLD.owner_id
     AND NOT org_changed
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

  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin') THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION
    'Changing status/is_vip/is_super_vip/discount_percent/vip_expires_at/owner_id/organization_id is not permitted from a non-admin user session'
    USING ERRCODE = '42501';
END;
$function$;
