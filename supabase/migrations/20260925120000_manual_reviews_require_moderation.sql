-- Manual-booking reviews must go through admin moderation, and only approved
-- reviews may count toward a host's public rating.
--
-- Security audit 2026-09-25: a host could self-review their own rental. The
-- manual-booking review link is (by design) handed to the host to forward to
-- the guest, so the host can always open it themselves. submit_manual_booking_review
-- runs as service_role, which enforce_review_lifecycle deliberately skips, and it
-- inserted without a status, so the column default 'approved' published the
-- review instantly on public_reviews. update_property_rating additionally
-- averaged EVERY review into profiles.rating regardless of status, and only on
-- INSERT, so hiding/removing a review never corrected the rating.
--
-- 1. submit_manual_booking_review: insert with status = 'pending' (body
--    otherwise verbatim from the live pg_get_functiondef). Online reviews were
--    already forced to 'pending' by enforce_review_lifecycle; this aligns the two.
-- 2. update_property_rating: count only status = 'approved', and recompute on
--    INSERT, DELETE and on UPDATE of status/rating/property_id, so an admin
--    approve/hide/remove is reflected. Handles both the old and new owner when a
--    review's property_id changes.
-- 3. One-time recompute of every reviewed owner's rating (no-op where already
--    equal; on staging all stored ratings already matched the approved-only
--    average at authoring time).

CREATE OR REPLACE FUNCTION public.submit_manual_booking_review(p_token text, p_rating numeric, p_comment text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
declare v_token public.manual_booking_review_tokens%rowtype; v_booking public.manual_bookings%rowtype; v_id uuid;
begin
  if p_rating<1 or p_rating>5 then raise exception 'rating must be between 1 and 5' using errcode='22023'; end if;
  select * into v_token from public.manual_booking_review_tokens where token_hash=digest(p_token,'sha256') for update;
  if not found or v_token.used_at is not null or v_token.expires_at<=now() then raise exception 'invalid or expired token' using errcode='22023'; end if;
  select * into v_booking from public.manual_bookings where id=v_token.manual_booking_id and status<>'cancelled';
  if not found then raise exception 'invalid or expired token' using errcode='22023'; end if;
  insert into public.reviews(property_id,booking_id,manual_booking_id,guest_id,guest_name_snapshot,rating,comment,status)
  values(v_booking.property_id,null,v_booking.id,null,nullif(btrim(v_booking.guest_name),''),p_rating,nullif(btrim(p_comment),''),'pending') returning id into v_id;
  update public.manual_booking_review_tokens set used_at=now() where manual_booking_id=v_booking.id;
  return v_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.update_property_rating()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_new_property uuid;
  v_old_property uuid;
  v_owner uuid;
BEGIN
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    v_new_property := NEW.property_id;
  END IF;
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    v_old_property := OLD.property_id;
  END IF;

  FOR v_owner IN
    SELECT DISTINCT p.owner_id
    FROM public.properties p
    WHERE p.id IN (v_new_property, v_old_property)
  LOOP
    UPDATE public.profiles SET rating = (
      SELECT COALESCE(AVG(r.rating), 0)
      FROM public.reviews r
      JOIN public.properties p ON r.property_id = p.id
      WHERE p.owner_id = v_owner
        AND r.status = 'approved'
    )
    WHERE id = v_owner;
  END LOOP;

  RETURN NULL;
END;
$function$;

DROP TRIGGER IF EXISTS on_review_insert ON public.reviews;
DROP TRIGGER IF EXISTS on_review_rating_change ON public.reviews;
CREATE TRIGGER on_review_rating_change
  AFTER INSERT OR DELETE OR UPDATE OF status, rating, property_id ON public.reviews
  FOR EACH ROW EXECUTE FUNCTION public.update_property_rating();

UPDATE public.profiles pr
SET rating = x.approved_avg
FROM (
  SELECT p.owner_id,
         -- profiles.rating is numeric(2,1); compare at that precision so rows
         -- that are already correct are not rewritten.
         ROUND(COALESCE(AVG(r.rating) FILTER (WHERE r.status = 'approved'), 0), 1) AS approved_avg
  FROM public.reviews r
  JOIN public.properties p ON p.id = r.property_id
  GROUP BY p.owner_id
) x
WHERE pr.id = x.owner_id
  AND pr.rating IS DISTINCT FROM x.approved_avg;
