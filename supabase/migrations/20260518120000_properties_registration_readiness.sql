-- Add free-form registration readiness text to properties for the sales detail page
-- e.g. "მე-4 კვარტალი, 2026" / "მზაა"
alter table public.properties
  add column if not exists registration_readiness text;

comment on column public.properties.registration_readiness is
  'Free-form Georgian text describing legal/cadastral registration timing (e.g., "მე-4 კვარტალი, 2026"). Nullable.';
