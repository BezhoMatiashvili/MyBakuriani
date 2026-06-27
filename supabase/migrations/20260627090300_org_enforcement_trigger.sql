-- Enforce company-listing rules at the DB layer so the existing client-side
-- properties insert (create/sale) cannot bypass them. No-op for personal
-- listings (organization_id IS NULL), so existing inserts are unaffected.
CREATE OR REPLACE FUNCTION public.enforce_org_listing_rules()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_limit int;
  v_unlimited boolean := false;
  v_count int;
BEGIN
  IF NEW.organization_id IS NULL THEN
    RETURN NEW;                              -- personal listing: nothing to enforce
  END IF;

  -- (a) posting user must be an approved member of the company
  IF NOT EXISTS (
    SELECT 1 FROM public.organization_members m
    WHERE m.organization_id = NEW.organization_id
      AND m.user_id = NEW.owner_id
      AND m.status = 'approved'
  ) THEN
    RAISE EXCEPTION 'თქვენ არ ხართ ამ კომპანიის დადასტურებული წევრი' USING ERRCODE = '42501';
  END IF;

  -- (b) the company must have an active subscription
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

  -- (c) apartment cap (exclude this row on UPDATE)
  IF NOT v_unlimited THEN
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
$$;
REVOKE ALL ON FUNCTION public.enforce_org_listing_rules() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_properties_org_enforce ON public.properties;
CREATE TRIGGER trg_properties_org_enforce
  BEFORE INSERT OR UPDATE OF organization_id, owner_id, status ON public.properties
  FOR EACH ROW EXECUTE FUNCTION public.enforce_org_listing_rules();
