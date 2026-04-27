-- Empty-string phones collide with the UNIQUE constraint and block email signups.
-- Normalise existing '' values to NULL and add a CHECK so this can't reappear.
UPDATE public.profiles SET phone = NULL WHERE phone = '';
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_phone_not_empty CHECK (phone IS NULL OR length(phone) > 0);
