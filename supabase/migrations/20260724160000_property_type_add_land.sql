-- Add 'land' (მიწის ნაკვეთი) as a first-class property_type.
--
-- Until now the sale create form overloaded the existing 'villa' value to mean
-- a land plot and only relabelled it in ONE i18n map, so every other surface
-- (sale detail page, sale search filter, admin audit panel, notifications)
-- rendered land plots as "ვილა". 'villa' now means an actual villa again.
--
-- This file contains ONLY the ADD VALUE. Postgres permits `ALTER TYPE … ADD
-- VALUE` inside a transaction but the new label cannot be *evaluated* until
-- that transaction commits (check_safe_enum_use → 55P04), and the backfill in
-- 20260724160100 is a bare top-level UPDATE. Apply the two files as two
-- separate operations.
alter type public.property_type add value if not exists 'land';

notify pgrst, 'reload schema';
