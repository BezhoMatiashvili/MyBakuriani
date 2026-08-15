-- The menu-item migration recreates public_services and adds another explicit
-- anonymous publication view after the original public-view hardening pass.
-- Preserve their SECURITY DEFINER publication behavior while preventing
-- caller predicates from being pushed beneath the safe projections/filters.

alter view public.public_services
  set (security_barrier = true, security_invoker = false);

alter view public.public_service_menu_items
  set (security_barrier = true, security_invoker = false);
