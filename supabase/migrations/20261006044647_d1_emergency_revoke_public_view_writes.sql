-- D1 emergency hotfix — revoke anon/authenticated WRITE access on the six public_* views.
--
-- Applied to PROD on 2026-10-06 (ledger version 20261006044647) with the owner's explicit
-- authorization, ahead of the full S0 security batch, to close a live CRITICAL: the
-- auto-updatable public_* views are owned by postgres (BYPASSRLS, security_invoker = false),
-- so anon/authenticated INSERT/UPDATE/DELETE on them writes straight into the underlying
-- organizations / profiles tables. This file exists so the repo matches the prod ledger; the
-- statement is copied verbatim from 20260926170000_s0_revoke_public_view_writes_default_privileges.sql
-- (lines 11-18) and becomes a no-op once that migration runs. SELECT is untouched, so every
-- public read keeps working; no application code writes through these views (C34).
--
-- Idempotent and atomic: re-running changes nothing; if any view is absent it errors and
-- changes nothing (investigate, do not edit the list). It deliberately omits the batch's
-- ALTER DEFAULT PRIVILEGES (D3) and the derive_marketing_opt_out ALTER, which do not exist on
-- prod yet and would roll the whole statement back.

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.public_properties,
     public.public_services,
     public.public_service_menu_items,
     public.public_organizations,
     public.public_reviews,
     public.public_listing_profiles
  FROM anon, authenticated;
