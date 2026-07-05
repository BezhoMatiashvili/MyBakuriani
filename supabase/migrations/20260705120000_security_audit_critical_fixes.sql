-- Security audit remediation (see SECURITY_AUDIT.md at repo root for full context).
-- Fixes, in order: C1 (profiles admin self-escalation on INSERT), C2 (profiles
-- admin_notes/phone public exposure), C3 (SMS/contact RPCs callable directly by
-- anon/authenticated), C4 (admin_dashboard_stats exposed to authenticated),
-- C5 (properties/services/bookings/smart_match_offers missing column-scoped
-- WITH CHECK), C6 (backup tables with RLS disabled).

-- ── C1: block self-assigning role='admin' on profile creation ──
-- profiles_lock_role (existing) only covers UPDATE OF role; INSERT was never
-- restricted beyond WITH CHECK (auth.uid() = id), so any signed-up user could
-- insert their own profile with role='admin'.
CREATE OR REPLACE FUNCTION public.prevent_admin_role_self_insert()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  caller_role text;
BEGIN
  IF NEW.role IS DISTINCT FROM 'admin' THEN
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

  IF EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  ) THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION
    'Creating a profile with role=admin is not permitted from a non-admin user session'
    USING ERRCODE = '42501';
END;
$function$;

DROP TRIGGER IF EXISTS profiles_lock_role_on_insert ON public.profiles;
CREATE TRIGGER profiles_lock_role_on_insert
BEFORE INSERT ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.prevent_admin_role_self_insert();

-- ── C2: profiles PII exposure — admin_notes moved to an admin-only side table,
-- and the blanket "viewable by everyone" SELECT policy narrowed. ──

CREATE TABLE IF NOT EXISTS public.profile_admin_notes (
  profile_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  notes text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.profile_admin_notes ENABLE ROW LEVEL SECURITY;
-- No policies: unreachable via anon/authenticated PostgREST roles, same
-- deny-by-default posture as the money/audit tables. Only service_role
-- (which bypasses RLS) can read/write it, matching every current admin route's
-- use of createServiceClient().

INSERT INTO public.profile_admin_notes (profile_id, notes)
SELECT id, admin_notes FROM public.profiles WHERE admin_notes IS NOT NULL
ON CONFLICT (profile_id) DO NOTHING;

ALTER TABLE public.profiles DROP COLUMN IF EXISTS admin_notes;

DROP POLICY IF EXISTS "Profiles are viewable by everyone" ON public.profiles;

-- Anonymous + authenticated: only rows that are legitimately public today —
-- active-listing owners (the "call the host" contact feature on public listing
-- pages), reviewers (display name on public review lists), and published blog
-- authors.
CREATE POLICY "Public can view active-listing owners and reviewers"
ON public.profiles FOR SELECT
TO anon, authenticated
USING (
  EXISTS (SELECT 1 FROM public.properties pr WHERE pr.owner_id = profiles.id AND pr.status = 'active')
  OR EXISTS (SELECT 1 FROM public.services s WHERE s.owner_id = profiles.id AND s.status = 'active')
  OR EXISTS (SELECT 1 FROM public.reviews r WHERE r.guest_id = profiles.id)
  OR EXISTS (SELECT 1 FROM public.blog_posts b WHERE b.author_id = profiles.id AND b.published = true)
);

-- Authenticated: interim carry-over of today's behavior for logged-in users
-- (any authenticated user can still read any profile). Narrowing this to only
-- real counterparties (bookings/cleaning/sms/org/smart-match relationships) is
-- larger, higher-regression-risk work tracked as a follow-up in SECURITY_AUDIT.md
-- — this migration's scope is closing the *anonymous, zero-cost* mass-scrape.
CREATE POLICY "Authenticated users can view all profiles"
ON public.profiles FOR SELECT
TO authenticated
USING (true);

-- ── C3: SMS/contact RPCs trust caller-supplied ids with no ownership check.
-- Every real caller in the app already goes through createServiceClient()
-- (service_role), so revoking anon/authenticated EXECUTE is a pure closure of
-- the direct-PostgREST-RPC bypass with zero app-code impact. service_role is
-- never affected by grants/revokes made to other roles. ──
REVOKE EXECUTE ON FUNCTION public.sms_send_broadcast(uuid, public.sms_broadcast_audience, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sms_consume_credit(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sms_consume_credits_bulk(uuid, uuid[]) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sms_audience_count(uuid, public.sms_broadcast_audience) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.record_contact_event(uuid, uuid, uuid, uuid, text) FROM PUBLIC, anon, authenticated;

-- ── C4: admin_dashboard_stats() has no internal admin check and is granted to
-- `authenticated` — any signed-in user could read platform revenue/business
-- metrics directly. Paired code change: src/lib/admin/getAdminStats.ts must
-- switch to the service client (see accompanying commit). ──
REVOKE EXECUTE ON FUNCTION public.admin_dashboard_stats() FROM PUBLIC, anon, authenticated;

-- ── C5: properties/services/bookings/smart_match_offers UPDATE policies have
-- no column-scoped WITH CHECK — owners/participants could directly rewrite
-- admin-or-payment-controlled columns via the client SDK. Pin protected columns
-- to their prior value unless the caller is admin or service_role. ──

CREATE OR REPLACE FUNCTION public.prevent_listing_protected_field_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  caller_role text;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status
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

DROP TRIGGER IF EXISTS properties_lock_protected_fields ON public.properties;
CREATE TRIGGER properties_lock_protected_fields
BEFORE UPDATE ON public.properties
FOR EACH ROW EXECUTE FUNCTION public.prevent_listing_protected_field_change();

DROP TRIGGER IF EXISTS services_lock_protected_fields ON public.services;
CREATE TRIGGER services_lock_protected_fields
BEFORE UPDATE ON public.services
FOR EACH ROW EXECUTE FUNCTION public.prevent_listing_protected_field_change();

CREATE OR REPLACE FUNCTION public.prevent_booking_protected_field_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  caller_role text;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status
     AND NEW.total_price IS NOT DISTINCT FROM OLD.total_price
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
    'Changing status/total_price is not permitted from a non-admin user session — use booking-manage'
    USING ERRCODE = '42501';
END;
$function$;

DROP TRIGGER IF EXISTS bookings_lock_protected_fields ON public.bookings;
CREATE TRIGGER bookings_lock_protected_fields
BEFORE UPDATE ON public.bookings
FOR EACH ROW EXECUTE FUNCTION public.prevent_booking_protected_field_change();

CREATE OR REPLACE FUNCTION public.prevent_smart_match_offer_identity_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  caller_role text;
BEGIN
  IF NEW.request_id IS NOT DISTINCT FROM OLD.request_id
     AND NEW.renter_id IS NOT DISTINCT FROM OLD.renter_id
     AND NEW.property_id IS NOT DISTINCT FROM OLD.property_id
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
    'Changing request_id/renter_id/property_id on a smart_match_offer is not permitted from a non-admin user session'
    USING ERRCODE = '42501';
END;
$function$;

DROP TRIGGER IF EXISTS smart_match_offers_lock_identity ON public.smart_match_offers;
CREATE TRIGGER smart_match_offers_lock_identity
BEFORE UPDATE ON public.smart_match_offers
FOR EACH ROW EXECUTE FUNCTION public.prevent_smart_match_offer_identity_change();

-- ── C6: backup tables from the base64-photo migration have RLS disabled
-- entirely, exposing every property/service's old photo arrays to any
-- anon/authenticated caller. Nothing in the app queries these via the API —
-- enable RLS with no policies (deny-all). ──
ALTER TABLE public.properties_photos_backup ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.services_photos_backup ENABLE ROW LEVEL SECURITY;
