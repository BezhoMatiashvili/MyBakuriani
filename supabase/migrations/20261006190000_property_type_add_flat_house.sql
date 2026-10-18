-- Add 'flat' (ბინა) and 'house' (სახლი) as property_type values (C13).
--
-- The owner's type list for listings is now ბინა, აპარტამენტი, სასტუმრო ოთახი,
-- კოტეჯი, ვილა, სახლი (+ მიწის ნაკვეთი on the sale form). 'apartment' keeps its
-- meaning (აპარტამენტი, as both create forms always labelled it). 'studio'
-- stays in the enum: existing studio listings keep it and the filters still find
-- them; the create forms simply stop offering it for new listings.
--
-- This file contains ONLY the ADD VALUEs, as 20260724160000 did: a new enum
-- label cannot be used in the transaction that adds it (55P04).
--
-- Deploy order: apply this BEFORE the app code that queries
-- `type in (..., 'flat', 'house')` (e.g. /apartments), or those queries fail
-- with 22P02 on a database that lacks the values.
alter type public.property_type add value if not exists 'flat';
alter type public.property_type add value if not exists 'house';

notify pgrst, 'reload schema';
