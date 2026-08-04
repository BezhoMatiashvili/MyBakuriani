-- Phase two: after the web client uses only overlap-safe RPCs, prevent browser
-- clients from bypassing cancellation/history/calendar-block invariants.
revoke insert, update, delete on table public.manual_bookings from authenticated;

-- Owner reads remain protected by the existing RLS policy.
grant select on table public.manual_bookings to authenticated;

notify pgrst, 'reload schema';
