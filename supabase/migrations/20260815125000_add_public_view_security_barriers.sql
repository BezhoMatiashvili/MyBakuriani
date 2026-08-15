-- These five SECURITY DEFINER views are intentional publication boundaries:
-- their base tables contain private contact/moderation fields and cannot be
-- exposed to anonymous RLS callers. The views project explicit safe columns.
--
-- A security barrier prevents caller-supplied predicates/functions from being
-- pushed below the view filter, closing optimizer-based side channels while
-- preserving the existing public response contract.

alter view public.public_listing_profiles
  set (security_barrier = true, security_invoker = false);

alter view public.public_properties
  set (security_barrier = true, security_invoker = false);

alter view public.public_services
  set (security_barrier = true, security_invoker = false);

alter view public.public_organizations
  set (security_barrier = true, security_invoker = false);

alter view public.public_reviews
  set (security_barrier = true, security_invoker = false);
