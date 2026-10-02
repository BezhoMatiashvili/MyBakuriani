-- Cleaner call-out details, part 2.
--
-- 1. WHICH apartment, and a way to open it. 20261001090000 gave the cleaner the
--    apartment's title, location and pin. A cleaner still could not tell a 35 m2 studio
--    from a 120 m2 villa, or open the listing to see photos ("what apartment is it?":
--    the CEO's words, said while looking at exactly that title and location). The
--    projection now also returns the listing's type, area, rooms and bathrooms, its id,
--    and whether it is public. The public page only exists for status = 'active', so the
--    link must not be offered for a draft the owner still sent a cleaner to.
--
-- 2. Least privilege. Every detail (owner name/avatar, phone, WhatsApp and everything
--    about the apartment) is now disclosed only while the call-out is live or finished
--    (pending, accepted, cancellation_requested, in_progress, completed). A declined or
--    cancelled call-out returns its row with nothing filled in. For an active listing the
--    title/location/pin/type/area/rooms/bathrooms are what public_properties already
--    shows everyone; for a non-active listing they are the owner's own act of sending
--    this cleaner there, and end with the call-out. Phone and WhatsApp are listing or
--    account contact data and are never in public_properties.
--
-- 3. The notification text shows owner-typed text (apartment title, address). Collapse
--    whitespace and control characters so a typed line break cannot fake a second line
--    (a "button" or link line) in the bell or the emailed copy.
--
-- 4. cleaning_tasks keeps its table-level INSERT/UPDATE/DELETE/TRUNCATE grants for
--    anon/authenticated from before C34. The RPC trusts the row's
--    (owner_id, property_id, cleaner_id) link, which only create_cleaning_task writes;
--    today RLS (a single participants' SELECT policy) is the only thing keeping a client
--    from writing it. Every browser/server use of the table is a SELECT and both write
--    paths are SECURITY DEFINER RPCs, so the grants are revoked: the link is now held by
--    grants AND RLS.
--
-- RETURNS TABLE cannot change under CREATE OR REPLACE, so the function is dropped and
-- recreated in this one transaction and its grants are restated (C34).

DROP FUNCTION IF EXISTS public.get_my_cleaning_task_owner_details();

CREATE FUNCTION public.get_my_cleaning_task_owner_details()
RETURNS TABLE (
  task_id uuid,
  owner_name text,
  owner_avatar_url text,
  phone text,
  whatsapp text,
  property_id uuid,
  property_title text,
  property_location text,
  property_lat numeric,
  property_lng numeric,
  property_type text,
  property_is_for_sale boolean,
  property_is_active boolean,
  property_area_sqm numeric,
  property_rooms integer,
  property_bathrooms integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    task.id,
    CASE WHEN g.live THEN NULLIF(btrim(owner_profile.display_name), '') END,
    CASE WHEN g.live THEN owner_profile.avatar_url END,
    CASE WHEN g.live THEN COALESCE(
      NULLIF(btrim(prop.phone), ''),
      NULLIF(btrim(owner_profile.phone), '')
    ) END,
    CASE WHEN g.live THEN NULLIF(btrim(prop.whatsapp), '') END,
    CASE WHEN g.live THEN prop.id END,
    CASE WHEN g.live THEN prop.title END,
    CASE WHEN g.live THEN prop.location END,
    CASE WHEN g.live THEN prop.location_lat END,
    CASE WHEN g.live THEN prop.location_lng END,
    CASE WHEN g.live THEN prop.type::text END,
    CASE WHEN g.live THEN COALESCE(prop.is_for_sale, false) ELSE false END,
    CASE WHEN g.live THEN COALESCE(prop.status = 'active', false) ELSE false END,
    CASE WHEN g.live THEN prop.area_sqm END,
    CASE WHEN g.live THEN prop.rooms END,
    CASE WHEN g.live THEN prop.bathrooms END
  FROM public.cleaning_tasks AS task
  CROSS JOIN LATERAL (
    SELECT task.status IN (
      'pending',
      'accepted',
      'cancellation_requested',
      'in_progress',
      'completed'
    ) AS live
  ) AS g
  LEFT JOIN public.profiles AS owner_profile ON owner_profile.id = task.owner_id
  LEFT JOIN public.properties AS prop ON prop.id = task.property_id
  WHERE task.cleaner_id = auth.uid();
$$;

REVOKE ALL ON FUNCTION public.get_my_cleaning_task_owner_details()
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_cleaning_task_owner_details()
  TO authenticated;

CREATE OR REPLACE FUNCTION public.notify_cleaner_of_new_task()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_title text;
BEGIN
  IF NEW.cleaner_id IS NULL THEN RETURN NEW; END IF;
  SELECT title INTO v_title FROM public.properties WHERE id = NEW.property_id;
  INSERT INTO public.notifications (user_id, type, title, message, action_url, dashboard_scope)
  VALUES (NEW.cleaner_id, 'cleaning_task_new', 'ახალი გამოძახება',
    COALESCE(
      NULLIF(btrim(regexp_replace(v_title, '[[:space:][:cntrl:]]+', ' ', 'g')), ''),
      'ობიექტი'
    ) || ' • '
      || to_char(NEW.scheduled_at AT TIME ZONE 'Asia/Tbilisi', 'DD.MM HH24:MI')
      || COALESCE(
        ' • ' || NULLIF(
          left(btrim(regexp_replace(NEW.address, '[[:space:][:cntrl:]]+', ' ', 'g')), 80),
          ''
        ),
        ''
      ),
    '/dashboard/cleaner', 'cleaner');
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'notify_cleaner_of_new_task failed for task %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

-- Defense in depth for the trust link above (C34). SELECT stays: RLS scopes it to the
-- owner and the cleaner, and Realtime postgres_changes needs it.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.cleaning_tasks FROM anon, authenticated;

NOTIFY pgrst, 'reload schema';
