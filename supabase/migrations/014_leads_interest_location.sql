-- 014_leads_interest_location.sql — Add interest_type & desired_location to leads
-- NOTE: Non-destructive, additive only. Safe for existing rows (both columns optional).
-- To apply: run via Supabase dashboard or `supabase db push`.

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS interest_type text;

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS desired_location text;
