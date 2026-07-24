-- Retype the two genuine land plots that were stored under the old 'villa'
-- overload (see 20260724160000_property_type_add_land.sql) and clear the
-- house-only columns they carry, so they render identically to a land listing
-- created after this change.
--
-- Targeted by id on purpose: of the four 'villa' rows, only these two are land.
-- facade00-…-000000000003 is a genuine sale villa and bd665082-… is a rental
-- villa — both keep type='villa'.
--
-- The SET list intentionally never names organization_id, owner_id or status:
-- enforce_org_listing_rules is `BEFORE INSERT OR UPDATE OF` those three columns
-- and fires on mention alone, even with an unchanged value (contract C11).
-- construction_stages is text[] NOT NULL, not jsonb — left untouched.
--
-- Keep this field set in sync with the land branch of
-- src/app/[locale]/create/sale/page.tsx; the card-level suppressions rely on
-- these columns being null for land.
update public.properties
set
  type = 'land',
  rooms = null,
  bathrooms = null,
  capacity = null,
  construction_status = null,
  construction_progress_percent = null,
  completion_year = null,
  renovation_status = null,
  units_total = null,
  units_sold = 0,
  units_reserved = 0,
  roi_percent = null,
  roi_percent_max = null,
  house_rules = coalesce(house_rules, '{}'::jsonb)
                - 'handover_month'
                - 'management_service'
where id in (
  '7f465cfd-ba22-4c69-a774-8070402de676',  -- "მიწა რა მიწა"
  '4a7deb1c-fce2-4224-aa11-164ab508b665'   -- "იიდეალური მიწა"
);
