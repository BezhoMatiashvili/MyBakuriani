-- A cleaner receiving a call-out could not see what they were agreeing to.
--
-- Cause: the cleaner dashboard and schedule embedded `properties(...)` and
-- `profiles!cleaning_tasks_owner_id_fkey(...)`, but RLS lets only the owner (or
-- an admin) read those rows, so for a real cleaner both embeds came back NULL:
-- "—" for the apartment and the owner, and no phone. The screenshot that raised
-- this was a same-account test (owner = cleaner), where the owner's own RLS let
-- the embeds through. The owner's note, the price unit and the owner's number
-- were never rendered by any surface.
--
-- Fix 1 - a cleaner-scoped projection, the mirror of
-- get_my_cleaning_task_cleaner_details() (which serves the renter side):
--   * rows only for call-outs where the caller IS the cleaner;
--   * apartment title / location / pin are fields public_properties already
--     exposes; nothing else from properties (no admin_notes, cadastral code...);
--   * the owner's number (listing phone, else account phone - the order the
--     check-in SMS uses) is disclosed while the job is live or finished
--     (pending, accepted, cancellation_requested, in_progress, completed) and is
--     NULL once the call-out was declined or cancelled. Unlike the renter-side
--     projection this one reveals the number on `pending`: the owner chose this
--     cleaner, and the cleaner needs the details to decide.
--
-- Fix 2 - notify_cleaner_of_new_task formatted scheduled_at in the database's
-- UTC zone, so the bell said 10:00 for a 14:00 Tbilisi job. It now formats in
-- Asia/Tbilisi (the zone the rest of the repo uses) and appends the address.
-- Only the message expression changed; the body is otherwise the live one.

CREATE OR REPLACE FUNCTION public.get_my_cleaning_task_owner_details()
RETURNS TABLE (
  task_id uuid,
  owner_name text,
  owner_avatar_url text,
  phone text,
  whatsapp text,
  property_title text,
  property_location text,
  property_lat numeric,
  property_lng numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    task.id,
    NULLIF(btrim(owner_profile.display_name), ''),
    owner_profile.avatar_url,
    CASE
      WHEN task.status IN (
        'pending',
        'accepted',
        'cancellation_requested',
        'in_progress',
        'completed'
      ) THEN COALESCE(
        NULLIF(btrim(prop.phone), ''),
        NULLIF(btrim(owner_profile.phone), '')
      )
      ELSE NULL
    END,
    CASE
      WHEN task.status IN (
        'pending',
        'accepted',
        'cancellation_requested',
        'in_progress',
        'completed'
      ) THEN NULLIF(btrim(prop.whatsapp), '')
      ELSE NULL
    END,
    prop.title,
    prop.location,
    prop.location_lat,
    prop.location_lng
  FROM public.cleaning_tasks AS task
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
    COALESCE(v_title, 'ობიექტი') || ' • '
      || to_char(NEW.scheduled_at AT TIME ZONE 'Asia/Tbilisi', 'DD.MM HH24:MI')
      || COALESCE(' • ' || NULLIF(left(btrim(NEW.address), 80), ''), ''),
    '/dashboard/cleaner', 'cleaner');
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'notify_cleaner_of_new_task failed for task %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

NOTIFY pgrst, 'reload schema';
