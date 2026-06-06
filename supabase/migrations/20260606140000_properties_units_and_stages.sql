-- 20260606140000_properties_units_and_stages.sql
-- Additive: unit-sales counters + completed construction-stage keys on properties.
-- Powers the seller "objects/projects" sales-progress bar and the construction
-- management dialog. Non-destructive; safe to run once.

ALTER TABLE public.properties
  ADD COLUMN IF NOT EXISTS units_total          smallint,
  ADD COLUMN IF NOT EXISTS units_sold           smallint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS units_reserved       smallint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS construction_stages  text[]   NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.properties.units_total IS
  'Total sellable units in the project/building (NULL = not a multi-unit project).';
COMMENT ON COLUMN public.properties.units_sold IS
  'Units already sold. Drives the seller "sales progress" bar.';
COMMENT ON COLUMN public.properties.units_reserved IS
  'Units reserved/booked but not yet sold.';
COMMENT ON COLUMN public.properties.construction_stages IS
  'Completed construction-stage keys (see src/lib/constants/construction.ts); source for construction_progress_percent.';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'properties_units_nonneg') THEN
    ALTER TABLE public.properties
      ADD CONSTRAINT properties_units_nonneg
      CHECK (units_sold >= 0 AND units_reserved >= 0 AND (units_total IS NULL OR units_total >= 0));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'properties_units_capacity') THEN
    ALTER TABLE public.properties
      ADD CONSTRAINT properties_units_capacity
      CHECK (units_total IS NULL OR (units_sold + units_reserved) <= units_total);
  END IF;
END $$;

-- DOWN:
-- ALTER TABLE public.properties DROP CONSTRAINT IF EXISTS properties_units_capacity;
-- ALTER TABLE public.properties DROP CONSTRAINT IF EXISTS properties_units_nonneg;
-- ALTER TABLE public.properties
--   DROP COLUMN IF EXISTS construction_stages,
--   DROP COLUMN IF EXISTS units_reserved,
--   DROP COLUMN IF EXISTS units_sold,
--   DROP COLUMN IF EXISTS units_total;
