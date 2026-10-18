-- 2026 price list §1: "MyBakuriani-ზე გაქირავების განცხადების განთავსებისთვის საჭიროა
-- შესაბამისი სეზონური წევრობა" — posting a rental listing requires an active seasonal
-- renter membership (hotels included; sales are out of scope).
--
-- The gate mirrors src/lib/membership/plans.ts:isMembershipActiveAt — a membership counts
-- only when status = 'active' AND starts_at <= now() AND expires_at > now(), so a paid
-- request still awaiting admin review, or an approved season that has not started yet,
-- does not unlock posting.
--
-- Scope, deliberately narrow:
--   * INSERT of a rental (is_for_sale false or NULL) by a browser session is gated.
--   * UPDATE is gated only when it turns a sale into a rental, so existing rentals stay
--     editable after a membership lapses (edits of approved listings already go through
--     the C14 review gate).
--   * service_role / no-JWT writers (migrations, cron, edge functions) and admins are
--     exempt, the same exemption force_listing_moderation_state uses.
-- SECURITY DEFINER so the owner's memberships are visible even when the row is written by
-- someone other than the owner (e.g. an approved org member flipping a listing); the
-- user_subscriptions RLS policy only exposes the caller's own rows.
-- The HINT is the stable machine-readable token the rental create form maps to its
-- localized message (src/lib/membership/plans.ts:RENTAL_MEMBERSHIP_REQUIRED_HINT).

CREATE OR REPLACE FUNCTION public.enforce_private_rental_membership()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  IF auth.role() IS NULL OR auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;
  IF public.is_admin_user() THEN
    RETURN NEW;
  END IF;

  IF coalesce(NEW.is_for_sale, false) THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND NOT coalesce(OLD.is_for_sale, false) THEN
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

DROP TRIGGER IF EXISTS properties_require_rental_membership ON public.properties;
CREATE TRIGGER properties_require_rental_membership
  BEFORE INSERT OR UPDATE OF is_for_sale ON public.properties
  FOR EACH ROW EXECUTE FUNCTION public.enforce_private_rental_membership();
