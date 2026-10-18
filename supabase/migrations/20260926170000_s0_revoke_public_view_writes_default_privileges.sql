-- Security hardening S0 (2026-09-26): close anon/authenticated WRITE access through the
-- public_* projection views, and stop default privileges from re-granting it.
--
-- public_organizations and public_listing_profiles are auto-updatable views owned by postgres
-- (BYPASSRLS, security_invoker=false). Supabase's default privileges had granted anon and
-- authenticated INSERT/UPDATE/DELETE on them directly, and 20260723000000 only revoked from
-- PUBLIC. So the public anon key could DELETE any active company or lister profile (with
-- cascades) and PATCH names, avatars and verified_at, bypassing RLS on the base tables.
-- No application code writes through these views, so reads are unchanged.

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.public_properties,
     public.public_services,
     public.public_service_menu_items,
     public.public_organizations,
     public.public_reviews,
     public.public_listing_profiles
  FROM anon, authenticated;

-- Root cause: objects created by postgres in public were auto-granted to anon/authenticated
-- (tables/views/sequences: ALL; functions: EXECUTE). From now on every new object needs
-- explicit GRANTs — see contract C34.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON SEQUENCES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM anon, authenticated;
-- A per-schema REVOKE cannot remove the built-in PUBLIC EXECUTE on new functions; only a
-- role-wide default can.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

-- Advisor lint 0011: pin search_path like the rest of the schema.
ALTER FUNCTION public.derive_marketing_opt_out() SET search_path = public;
