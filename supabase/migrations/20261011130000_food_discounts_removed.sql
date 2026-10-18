-- 20261011130000_food_discounts_removed.sql
--
-- Restaurants make no discounts (contract C21), the owner's call 2026-10-11.
-- The food cabinet no longer offers one anywhere (food home, menu page,
-- balance page), the per-dish API route and the Keepz "menu-item-discount"
-- resume are gone, and this migration makes the database refuse one, so no
-- path is left:
--   * service_menu_items: a dish's discount_percent must be 0. The per-dish
--     RPCs (self_service_activate_menu_item_discount and the legacy
--     submit/approve_menu_item_discount_request) stay installed but can no
--     longer write a discount; the vip-lifecycle sweep only ever writes 0.
--   * services: an AFTER INSERT OR UPDATE trigger refuses a non-zero
--     discount_percent on a food row. purchase_package's discount tier (via
--     the purchase-vip edge function), the admin listing editor and the
--     legacy approve_food_discount_request all reach it. HINT 'invalid_target'
--     is a reason purchase-vip already answers with HTTP 400, so a crafted
--     purchase is refused cleanly, charges nothing (one transaction) and, as
--     SQLSTATE 23514, queues no payment_failed mail. AFTER, so the rule sees
--     the row the BEFORE triggers produced.
--
-- 20261011120000_food_whole_menu_discount (applied on STAGING the same day,
-- then superseded) made public_services count services.discount_percent for
-- food; with this rule that value is always 0, so it changes nothing.
--
-- Refuses with 55000 while any food listing or dish still carries a discount
-- (none on staging or prod, checked 2026-10-11): end or refund it first;
-- nothing is cleared here.
--
-- Prod: apply any time; it does not depend on the app deploy.

SET LOCAL search_path = public;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.services
    WHERE category = 'food' AND COALESCE(discount_percent, 0) <> 0
  ) OR EXISTS (
    SELECT 1 FROM public.service_menu_items WHERE discount_percent <> 0
  ) THEN
    RAISE EXCEPTION 'a restaurant or a dish still carries a discount; end it before applying'
      USING ERRCODE = '55000';
  END IF;
END
$$;

ALTER TABLE public.service_menu_items
  ADD CONSTRAINT service_menu_items_no_discount CHECK (discount_percent = 0);

CREATE OR REPLACE FUNCTION public.refuse_food_listing_discount()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $function$
BEGIN
  IF NEW.category = 'food' AND COALESCE(NEW.discount_percent, 0) <> 0 THEN
    RAISE EXCEPTION 'food_discounts_removed'
      USING ERRCODE = '23514', HINT = 'invalid_target';
  END IF;
  RETURN NULL;
END;
$function$;

REVOKE ALL ON FUNCTION public.refuse_food_listing_discount() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER services_refuse_food_discount
  AFTER INSERT OR UPDATE OF discount_percent, category ON public.services
  FOR EACH ROW EXECUTE FUNCTION public.refuse_food_listing_discount();
