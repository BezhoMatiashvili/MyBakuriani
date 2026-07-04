-- Align the booking-confirmed trigger with the per-day INCLUSIVE billing model
-- (see 20260628120000_create_booking_inclusive_days.sql). The trigger fires on
-- on_booking_confirmed and re-inserts calendar_blocks for the stay; make its
-- range inclusive of the check-out day so any path that reaches 'confirmed'
-- keeps the check-out day blocked.
--
-- Only the generate_series upper bound changes (drops `- INTERVAL '1 day'`).
-- SET search_path = '', schema-qualified refs, and ON CONFLICT DO NOTHING are
-- preserved from 20260626121000_fix_function_search_path.sql. DO NOTHING cannot
-- clobber existing reservations.
--
-- Rollback: re-apply the prior definition (upper bound NEW.check_out - INTERVAL '1 day').

CREATE OR REPLACE FUNCTION public.create_booking_calendar_blocks()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  INSERT INTO public.calendar_blocks (property_id, date, status, booking_id)
  SELECT NEW.property_id, d::date, 'booked', NEW.id
  FROM generate_series(NEW.check_in, NEW.check_out, INTERVAL '1 day') d  -- inclusive of check-out
  ON CONFLICT (property_id, date) DO NOTHING;
  RETURN NEW;
END;
$$;
