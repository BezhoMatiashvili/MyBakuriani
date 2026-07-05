-- Regression fix: the C5 protected-column trigger (20260705120000) locked
-- `status` uniformly on both properties AND services. Properties never has a
-- direct owner-driven status update in the app (verified: no `.update()` on
-- properties.status anywhere in src/), so full locking there is correct and
-- unchanged. But services legitimately DOES have owner-driven self-service
-- status toggles that are NOT the self-approval bypass C5 was meant to
-- block:
--   - FoodDashboardClient.tsx togglePublished(): active <-> draft
--   - ServiceDashboardClient.tsx removeService(): -> blocked
-- (this same component/pattern is shared by the service/food/entertainment/
-- transport/employment dashboards). Those calls now fail silently (RLS/trigger
-- rejects them, UI doesn't check the error and optimistically updates anyway).
--
-- The actual exploit C5 needed to close was self-approving OUT of 'pending'
-- (bypassing admin moderation on a newly-created listing), not managing an
-- already-approved listing's visibility. Narrow the services-specific lock to
-- exactly that transition; properties keeps the full lock since it has no
-- legitimate self-service status path today.
CREATE OR REPLACE FUNCTION public.prevent_listing_protected_field_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  caller_role text;
  status_changed boolean;
  status_locked boolean;
BEGIN
  status_changed := NEW.status::text IS DISTINCT FROM OLD.status::text;

  IF TG_TABLE_NAME = 'services' THEN
    -- Only block leaving 'pending' (the self-approval bypass); owners can
    -- freely toggle active/draft/blocked on an already-moderated listing.
    status_locked := status_changed AND OLD.status::text = 'pending';
  ELSE
    status_locked := status_changed;
  END IF;

  IF NOT status_locked
     AND NEW.is_vip IS NOT DISTINCT FROM OLD.is_vip
     AND NEW.is_super_vip IS NOT DISTINCT FROM OLD.is_super_vip
     AND NEW.discount_percent IS NOT DISTINCT FROM OLD.discount_percent
     AND NEW.vip_expires_at IS NOT DISTINCT FROM OLD.vip_expires_at
     AND NEW.owner_id IS NOT DISTINCT FROM OLD.owner_id
     AND (TG_TABLE_NAME <> 'properties' OR NEW.organization_id IS NOT DISTINCT FROM OLD.organization_id)
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
