-- Notify the owner when a new listing is created in 'pending' status, so they
-- know it's awaiting admin review. Covers all listing types in one place:
--   properties  -> rental + sale create pages
--   services    -> food / service / transport / employment / entertainment
--
-- A trigger is the only correct seam: the create pages insert client-side and
-- the notifications table has no client INSERT policy, so a page-side insert
-- would be rejected by RLS. AFTER INSERT ... WHEN (NEW.status = 'pending')
-- fires exactly once per new listing — edits use UPDATE, and seeds insert
-- status='active', so neither re-fires.

CREATE OR REPLACE FUNCTION public.notify_listing_pending()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public._notify(
    NEW.owner_id,
    'listing_pending',
    'თქვენი განცხადება განხილვის პროცესშია',
    'თქვენი განცხადება გადაეგზავნა ადმინისტრატორს დასადასტურებლად.',
    '/dashboard'
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_properties_pending_notify ON public.properties;
CREATE TRIGGER trg_properties_pending_notify
  AFTER INSERT ON public.properties
  FOR EACH ROW
  WHEN (NEW.status = 'pending')
  EXECUTE FUNCTION public.notify_listing_pending();

DROP TRIGGER IF EXISTS trg_services_pending_notify ON public.services;
CREATE TRIGGER trg_services_pending_notify
  AFTER INSERT ON public.services
  FOR EACH ROW
  WHEN (NEW.status = 'pending')
  EXECUTE FUNCTION public.notify_listing_pending();
