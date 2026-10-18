-- Company listing limit: one attach at a time per organization (2026-10-15, C11).
--
-- enforce_org_listing_rules() (BEFORE INSERT OR UPDATE OF organization_id, owner_id,
-- status ON properties) counts the organization's listings and refuses once the
-- active plan's listing_limit is reached, with no lock: concurrent requests that
-- attach listings to one organization (separate PATCH /rest/v1/properties calls by
-- approved members) each counted only committed rows, so all of them passed while
-- the count was under the limit and the company kept more listings than its plan
-- allows. The count now runs under a transaction advisory lock keyed on the
-- organization, so a second attach waits for the first to commit and counts it (a
-- PL/pgSQL statement takes a new snapshot after the lock is granted). Sequential
-- attaches, the error text and every legit request behave as before; plans without
-- a limit take no lock.
--
-- Body = the live staging definition with that one PERFORM added; the guard refuses
-- (55000) where the live body differs. CREATE OR REPLACE keeps the function's ACL
-- and the trigger.

do $guard$
declare
  v_live text;
begin
  select md5(p.prosrc) into v_live
    from pg_proc p
   where p.oid = to_regprocedure('public.enforce_org_listing_rules()');
  if v_live is distinct from '9fa2f55c5db4cfd33bba608a63a1f25b' then
    raise exception 'org_listing_limit_lock: enforce_org_listing_rules() differs from the reviewed body (md5 %); regenerate this migration from the live definition', v_live
      using errcode = '55000';
  end if;
end
$guard$;

CREATE OR REPLACE FUNCTION public.enforce_org_listing_rules()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_limit int;
  v_unlimited boolean := false;
  v_count int;
BEGIN
  IF NEW.organization_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.organization_members m
    WHERE m.organization_id = NEW.organization_id
      AND m.user_id = NEW.owner_id
      AND m.status = 'approved'
  ) THEN
    RAISE EXCEPTION 'თქვენ არ ხართ ამ კომპანიის დადასტურებული წევრი' USING ERRCODE = '42501';
  END IF;

  SELECT listing_limit, (listing_limit IS NULL)
    INTO v_limit, v_unlimited
  FROM public.organization_subscriptions s
  WHERE s.organization_id = NEW.organization_id
    AND s.status = 'active'
    AND s.expires_at > now()
  ORDER BY s.expires_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'კომპანიას არ აქვს აქტიური გამოწერა' USING ERRCODE = '42501';
  END IF;

  IF NOT v_unlimited THEN
    -- One attach at a time per organization: without this, concurrent attaches
    -- each count before the other commits and all pass under the limit.
    PERFORM pg_advisory_xact_lock(hashtextextended('org-listing-limit:' || NEW.organization_id::text, 0));
    SELECT count(*) INTO v_count
    FROM public.properties p
    WHERE p.organization_id = NEW.organization_id
      AND p.id <> NEW.id;
    IF v_count >= v_limit THEN
      RAISE EXCEPTION 'გამოწერის ლიმიტი ამოწურულია (მაქს. % ბინა)', v_limit USING ERRCODE = '22023';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;
