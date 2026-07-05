-- Second-pass re-audit fixes (see SECURITY_AUDIT.md "Second-pass re-audit" section).
-- 1. bookings: protected-column trigger was scoped too narrowly (status/total_price
--    only) — extend to check_in/check_out/property_id/guest_id/owner_id/guests_count.
-- 2. profiles: is_verified/verified_at had no protection at all (only role was locked).
-- 3. cleaning_tasks: never received the protected-column-lock pattern applied to
--    its sibling tables — add it (price/owner_id/cleaner_id/property_id).
-- 4. smart_match_offers: identity-lock trigger didn't cover offered_price, letting
--    either party rewrite the other's price bid.
-- 5. organizations.admin_notes: same PII/moderation-notes class as the profiles C2
--    fix, on a table C2 didn't touch — move to a deny-all side table.
-- 6. global_search(): SECURITY DEFINER, anon-executable, returns to_jsonb(row) for
--    properties/services — was leaking admin_notes in bulk, unauthenticated.

-- ── 1. bookings: widen the protected-column trigger ──
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
     AND NEW.check_in IS NOT DISTINCT FROM OLD.check_in
     AND NEW.check_out IS NOT DISTINCT FROM OLD.check_out
     AND NEW.property_id IS NOT DISTINCT FROM OLD.property_id
     AND NEW.guest_id IS NOT DISTINCT FROM OLD.guest_id
     AND NEW.owner_id IS NOT DISTINCT FROM OLD.owner_id
     AND NEW.guests_count IS NOT DISTINCT FROM OLD.guests_count
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
    'Changing status/total_price/check_in/check_out/property_id/guest_id/owner_id/guests_count is not permitted from a non-admin user session — use booking-manage'
    USING ERRCODE = '42501';
END;
$function$;

-- ── 2. profiles: lock is_verified/verified_at (role is already locked separately) ──
CREATE OR REPLACE FUNCTION public.prevent_profile_verification_self_grant()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  caller_role text;
BEGIN
  IF NEW.is_verified IS NOT DISTINCT FROM OLD.is_verified
     AND NEW.verified_at IS NOT DISTINCT FROM OLD.verified_at
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
    'Changing is_verified/verified_at is not permitted from a non-admin user session'
    USING ERRCODE = '42501';
END;
$function$;

DROP TRIGGER IF EXISTS profiles_lock_verification ON public.profiles;
CREATE TRIGGER profiles_lock_verification
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.prevent_profile_verification_self_grant();

-- ── 3. cleaning_tasks: add the protected-column-lock pattern (missed on this table) ──
CREATE OR REPLACE FUNCTION public.prevent_cleaning_task_protected_field_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  caller_role text;
BEGIN
  IF NEW.price IS NOT DISTINCT FROM OLD.price
     AND NEW.owner_id IS NOT DISTINCT FROM OLD.owner_id
     AND NEW.cleaner_id IS NOT DISTINCT FROM OLD.cleaner_id
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
    'Changing price/owner_id/cleaner_id/property_id is not permitted from a non-admin user session'
    USING ERRCODE = '42501';
END;
$function$;

DROP TRIGGER IF EXISTS cleaning_tasks_lock_protected_fields ON public.cleaning_tasks;
CREATE TRIGGER cleaning_tasks_lock_protected_fields
BEFORE UPDATE ON public.cleaning_tasks
FOR EACH ROW EXECUTE FUNCTION public.prevent_cleaning_task_protected_field_change();

-- ── 4. smart_match_offers: widen identity-lock trigger to also cover offered_price
-- (status/guest_seen stay mutable — both sides legitimately transition those) ──
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
     AND NEW.offered_price IS NOT DISTINCT FROM OLD.offered_price
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
    'Changing request_id/renter_id/property_id/offered_price on a smart_match_offer is not permitted from a non-admin user session'
    USING ERRCODE = '42501';
END;
$function$;

-- ── 5. organizations.admin_notes: move to a deny-all side table, same pattern as
-- profile_admin_notes. Nothing renders admin_notes in the seller org-detail page
-- today (verified: fetched into state but never read in JSX) — safe to drop. ──
CREATE TABLE IF NOT EXISTS public.organization_admin_notes (
  organization_id uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  notes text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.organization_admin_notes ENABLE ROW LEVEL SECURITY;
-- No policies: deny-all for anon/authenticated, matching profile_admin_notes.

INSERT INTO public.organization_admin_notes (organization_id, notes)
SELECT id, admin_notes FROM public.organizations WHERE admin_notes IS NOT NULL
ON CONFLICT (organization_id) DO NOTHING;

ALTER TABLE public.organizations DROP COLUMN IF EXISTS admin_notes;

-- ── 6. global_search(): strip admin_notes from the to_jsonb(row) payload for
-- properties/services (blog_posts has no admin_notes column). ──
CREATE OR REPLACE FUNCTION public.global_search(
  q text,
  entity_types text[] DEFAULT ARRAY['properties'::text, 'services'::text, 'blog_posts'::text],
  result_limit integer DEFAULT 80
)
RETURNS TABLE(entity_type text, entity_id uuid, title text, snippet text, slug text, photo text, sim real, payload jsonb)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH q_norm AS (
    SELECT lower(trim(coalesce(q, ''))) AS qn
  )
  SELECT * FROM (
    SELECT
      'properties'::text AS entity_type,
      p.id AS entity_id,
      p.title,
      COALESCE(p.location, p.description, '')::text AS snippet,
      p.id::text AS slug,
      COALESCE(p.photos[1], '')::text AS photo,
      GREATEST(
        similarity(lower(p.title), qn),
        similarity(lower(COALESCE(p.description, '')), qn),
        similarity(lower(COALESCE(p.location, '')), qn),
        CASE
          WHEN p.cadastral_code IS NOT NULL
          THEN similarity(lower(p.cadastral_code), qn) * 1.5
          ELSE 0
        END
      )::real AS sim,
      to_jsonb(p) - 'admin_notes' AS payload
    FROM public.properties p, q_norm
    WHERE p.status = 'active'
      AND (
        p.organization_id IS NULL
        OR EXISTS (
          SELECT 1 FROM public.organizations o
          WHERE o.id = p.organization_id AND o.status = 'active'
        )
      )
      AND 'properties' = ANY(entity_types)
      AND qn <> ''
      AND (
        lower(p.title) ILIKE '%' || qn || '%'
        OR lower(COALESCE(p.description, '')) ILIKE '%' || qn || '%'
        OR lower(COALESCE(p.location, '')) ILIKE '%' || qn || '%'
        OR lower(COALESCE(p.cadastral_code, '')) ILIKE '%' || qn || '%'
        OR similarity(lower(p.title), qn) > 0.15
        OR similarity(lower(COALESCE(p.description, '')), qn) > 0.15
        OR similarity(lower(COALESCE(p.location, '')), qn) > 0.15
      )

    UNION ALL

    SELECT
      'services'::text,
      s.id,
      s.title,
      COALESCE(s.location, s.description, '')::text,
      s.id::text,
      COALESCE(s.photos[1], '')::text,
      GREATEST(
        similarity(lower(s.title), qn),
        similarity(lower(COALESCE(s.description, '')), qn),
        similarity(lower(COALESCE(s.location, '')), qn),
        similarity(lower(COALESCE(s.cuisine_type, '')), qn),
        similarity(lower(COALESCE(s.position, '')), qn)
      )::real,
      to_jsonb(s) - 'admin_notes'
    FROM public.services s, q_norm
    WHERE s.status = 'active'
      AND 'services' = ANY(entity_types)
      AND qn <> ''
      AND (
        lower(s.title) ILIKE '%' || qn || '%'
        OR lower(COALESCE(s.description, '')) ILIKE '%' || qn || '%'
        OR lower(COALESCE(s.location, '')) ILIKE '%' || qn || '%'
        OR lower(COALESCE(s.cuisine_type, '')) ILIKE '%' || qn || '%'
        OR lower(COALESCE(s.position, '')) ILIKE '%' || qn || '%'
        OR similarity(lower(s.title), qn) > 0.15
        OR similarity(lower(COALESCE(s.description, '')), qn) > 0.15
        OR similarity(lower(COALESCE(s.location, '')), qn) > 0.15
      )

    UNION ALL

    SELECT
      'blog_posts'::text,
      b.id,
      b.title,
      COALESCE(b.excerpt, left(b.content, 200), '')::text,
      b.slug,
      COALESCE(b.image_url, '')::text,
      GREATEST(
        similarity(lower(b.title), qn),
        similarity(lower(COALESCE(b.excerpt, '')), qn),
        similarity(lower(COALESCE(b.content, '')), qn)
      )::real,
      to_jsonb(b)
    FROM public.blog_posts b, q_norm
    WHERE b.published = true
      AND 'blog_posts' = ANY(entity_types)
      AND qn <> ''
      AND (
        lower(b.title) ILIKE '%' || qn || '%'
        OR lower(COALESCE(b.excerpt, '')) ILIKE '%' || qn || '%'
        OR lower(COALESCE(b.content, '')) ILIKE '%' || qn || '%'
        OR similarity(lower(b.title), qn) > 0.15
      )
  ) hits
  ORDER BY sim DESC NULLS LAST
  LIMIT result_limit;
$function$;

NOTIFY pgrst, 'reload schema';
