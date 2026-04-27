-- Add employment-specific fields to services table for the redesigned /create/employment form.
-- All columns are nullable; no destructive changes.

ALTER TABLE services
  ADD COLUMN IF NOT EXISTS employment_type TEXT,
  ADD COLUMN IF NOT EXISTS work_schedule TEXT,
  ADD COLUMN IF NOT EXISTS salary_type TEXT,
  ADD COLUMN IF NOT EXISTS salary_min NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS salary_max NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS salary_daily NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS accommodation TEXT,
  ADD COLUMN IF NOT EXISTS meals TEXT,
  ADD COLUMN IF NOT EXISTS requirements TEXT,
  ADD COLUMN IF NOT EXISTS languages TEXT[];
