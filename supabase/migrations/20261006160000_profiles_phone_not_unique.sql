-- profiles.phone stopped being a sign-in identity when phone OTP was removed
-- (2026-09-22): it is now a self-entered, unverified contact number, and nothing
-- looks a profile up by it. The UNIQUE constraint left from 001_initial_schema made
-- every settings save fail with 23505 (shown as a generic error) whenever another
-- account, often the same person's second account, already held the number, and it
-- let anyone reserve someone else's number first. The SMS caps already count per
-- canonical number across accounts (C18). profiles_phone_not_empty stays.
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_phone_key;
