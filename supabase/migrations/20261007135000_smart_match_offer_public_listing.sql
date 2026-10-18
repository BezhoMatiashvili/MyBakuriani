-- Smart Match offers only from a listing the guest can open (C31).
--
-- A rental is public only while its owner holds an active membership
-- (public_properties, 20261004120000). Offers were still accepted from hidden
-- rentals, so the guest got "new offer" and a link to a 404 detail page
-- (staging 2026-10-07: CRYSTAL WOOD, whose owner has no membership).
--
-- The check reads public_properties itself, so it can never drift from what the
-- detail pages serve. service_role / server writers are exempt, as in
-- enforce_smart_match_request_rules. The error is 22023 with the token
-- 'smart_match_listing_not_public', which the offer form matches by message
-- (22023 is shared with the request rules). Offers already sent stay; the guest
-- dashboards show them as "listing unavailable".
CREATE OR REPLACE FUNCTION public.enforce_smart_match_offer_public_listing()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_role text;
begin
  begin
    v_role := auth.role();
  exception when others then
    v_role := null;
  end;
  if v_role is null or v_role = 'service_role' then
    return new;
  end if;

  if not exists (select 1 from public.public_properties pp where pp.id = new.property_id) then
    raise exception 'smart_match_listing_not_public' using errcode = '22023';
  end if;
  return new;
end;
$function$;

REVOKE ALL ON FUNCTION public.enforce_smart_match_offer_public_listing() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_enforce_smart_match_offer_public_listing ON public.smart_match_offers;

CREATE TRIGGER trg_enforce_smart_match_offer_public_listing BEFORE INSERT ON public.smart_match_offers FOR EACH ROW EXECUTE FUNCTION public.enforce_smart_match_offer_public_listing();
