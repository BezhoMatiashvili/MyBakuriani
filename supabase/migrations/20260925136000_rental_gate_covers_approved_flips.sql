-- Rental posting gate (20260925135000): close the content-change approval bypass.
--
-- Security review 2026-09-25: is_for_sale is a reviewable property field (C14), and
-- approve_content_change_request applies an OWNER-submitted change through the
-- service-role client. The gate exempted service_role and admins on every path, so
-- "create a sale (no membership needed) → request is_for_sale=false → admin approves"
-- produced a rental without a seasonal membership. Reproduced on staging before this
-- migration; the approval returned 'approved' and flipped the listing.
--
-- A sale→rental flip creates a rental for the OWNER whoever performs the write, so an
-- UPDATE flip now requires the owner's active membership for every JWT-carrying role
-- (authenticated, admin, service_role). Unchanged:
--   * maintenance writes without a JWT (migrations, SQL editor, pg_cron) stay exempt;
--   * INSERTs by service_role or an admin stay exempt (seeds, admin tooling);
--   * sales pass, and edits of existing rentals are never gated.
-- The HINT is unchanged (src/lib/membership/plans.ts:RENTAL_MEMBERSHIP_REQUIRED_HINT).

CREATE OR REPLACE FUNCTION public.enforce_private_rental_membership()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  IF auth.role() IS NULL THEN
    RETURN NEW;
  END IF;

  IF coalesce(NEW.is_for_sale, false) THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NOT coalesce(OLD.is_for_sale, false) THEN
      RETURN NEW;
    END IF;
  ELSIF auth.role() = 'service_role' OR public.is_admin_user() THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.user_subscriptions s
    WHERE s.user_id = NEW.owner_id
      AND s.status = 'active'
      AND s.starts_at <= now()
      AND s.expires_at > now()
  ) THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'გაქირავების განცხადების განთავსებისთვის საჭიროა აქტიური სეზონური წევრობა'
    USING ERRCODE = '42501', HINT = 'RENTAL_MEMBERSHIP_REQUIRED';
END;
$function$;

REVOKE ALL ON FUNCTION public.enforce_private_rental_membership() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enforce_private_rental_membership() TO service_role;
