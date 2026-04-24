-- Relax profiles.phone to nullable so users who sign up via email/OAuth
-- (no phone on auth.users) can complete the /auth/register role-selection step.
-- Phone-OTP users still populate phone on their auth.users row, so the field
-- continues to work as identifier where present. The UNIQUE constraint is kept
-- (Postgres treats multiple NULLs as distinct by default, so email users do
-- not collide on NULL phone).
ALTER TABLE public.profiles ALTER COLUMN phone DROP NOT NULL;
