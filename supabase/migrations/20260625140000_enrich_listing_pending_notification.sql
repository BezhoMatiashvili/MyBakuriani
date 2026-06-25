-- Enrich the "listing submitted / awaiting review" notification so the owner
-- knows WHICH listing it refers to. Only the message text changes — the title,
-- type, action_url, triggers, and the properties/services wiring are unchanged.
--
-- The function is shared by trg_properties_pending_notify and
-- trg_services_pending_notify, so it may only reference columns common to both
-- tables. `title` is the only safe field (type/category/is_for_sale exist on
-- just one table) — so we name the listing by its title and keep the generic
-- /dashboard action_url (pending listings aren't publicly viewable yet).
--
-- Non-destructive: CREATE OR REPLACE of the function body only.
-- Down: re-replace the message with the original one-liner
--   'თქვენი განცხადება გადაეგზავნა ადმინისტრატორს დასადასტურებლად.'

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
    '„' || COALESCE(NULLIF(NEW.title, ''), 'განცხადება')
      || '" გადაეგზავნა ადმინისტრატორს დასადასტურებლად.',
    '/dashboard'
  );
  RETURN NEW;
END;
$$;
