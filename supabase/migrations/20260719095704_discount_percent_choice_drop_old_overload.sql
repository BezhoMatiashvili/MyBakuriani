-- CREATE OR REPLACE only replaces a function with an IDENTICAL argument
-- signature; adding p_discount_percent created a second overload instead of
-- replacing the old one, leaving the old hardcoded-10 4-arg version callable
-- in parallel. Drop it so there is exactly one purchase_package, matching
-- every other CREATE OR REPLACE in this migration history that assumed
-- in-place replacement.
DROP FUNCTION IF EXISTS public.purchase_package(uuid, uuid, uuid, integer);
