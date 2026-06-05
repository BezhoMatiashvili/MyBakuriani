-- Persist the service-sphere label chosen at creation and the name/company entered on the
-- create-service form, so the listing detail page can display them. Both nullable for existing rows.
ALTER TABLE services ADD COLUMN IF NOT EXISTS service_field TEXT;
ALTER TABLE services ADD COLUMN IF NOT EXISTS provider_name TEXT;

COMMENT ON COLUMN services.service_field IS 'Display label of the service sphere chosen at creation (მომსახურების სფერო)';
COMMENT ON COLUMN services.provider_name IS 'Name/company entered on the create-service form (სახელი / კომპანია)';
