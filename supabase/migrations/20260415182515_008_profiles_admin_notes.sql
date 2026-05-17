ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS admin_notes text;
