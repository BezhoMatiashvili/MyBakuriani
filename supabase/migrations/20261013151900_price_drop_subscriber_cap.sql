-- Price-drop alert subscribers: the 50-per-listing cap held in the database
-- (2026-10-15, C18).
--
-- PUT /api/listings/property/[propertyId]/price-drop-alert counts a listing's
-- other active subscribers and refuses at 50 (each one costs the listing's owner
-- an SMS credit per price drop), then upserts the subscription in a second call
-- with no lock, and nothing in the database bounded the count: concurrent
-- requests from many accounts each counted below 50 and all subscribed (a
-- rolled-back replay at the boundary left 52). This trigger repeats the route's
-- exact count under a transaction advisory lock per listing, so a second
-- subscribe waits for the first to commit and counts it, and refuses with HINT
-- subscriber_limit_reached, which the route answers with its existing 409.
-- It fires for a row becoming active (insert, or active false -> true); an
-- unsubscribe or an update of an already active row is never refused. A serial
-- request gets exactly the answer the route's own check already gives.

CREATE FUNCTION public.enforce_price_drop_subscriber_cap()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
  IF NEW.active AND (TG_OP = 'INSERT' OR OLD.active IS DISTINCT FROM true) THEN
    -- One subscribe at a time per listing: without it, concurrent requests each
    -- count before the others commit and all pass the cap.
    PERFORM pg_advisory_xact_lock(hashtextextended('price-drop-subscribers:' || NEW.property_id::text, 0));
    IF (SELECT count(*) FROM public.sale_price_alert_subscriptions s
         WHERE s.property_id = NEW.property_id
           AND s.active
           AND s.subscriber_id <> NEW.subscriber_id) >= 50 THEN
      RAISE EXCEPTION 'subscriber_limit_reached'
        USING ERRCODE = 'P0001', HINT = 'subscriber_limit_reached';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.enforce_price_drop_subscriber_cap() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER sale_price_alert_subscriber_cap
  BEFORE INSERT OR UPDATE OF active ON public.sale_price_alert_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.enforce_price_drop_subscriber_cap();
