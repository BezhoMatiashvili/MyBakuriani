-- C18/C24: the cleaner's SMS for a new call-out said only "MyBakuriani: ახალი გამოძახება" (the
-- notification mirror texts the title alone), so the cleaner had to open the site to learn which
-- apartment and when. The bell already shows both. The mirror (notifications_enqueue_sms) still
-- decides WHETHER to text (allow-list, phone, e2e skip, caps); this trigger, the only place that
-- holds the call-out's own values, then rewords the row the mirror queued for its notification:
--
--   MyBakuriani: ახალი გამოძახება — <apartment, 25>, DD.MM HH:MI. დეტალები: <site>/dashboard/cleaner
--
-- At most 130 UTF-16 units with the staging host (two UCS-2 segments), 122 with the canonical one.
-- The apartment is the already-flattened title the bell prints (owner-typed, at most 25 like
-- domain.ts PROPERTY_TITLE_MAX, a longer one cut to 24 + '…' as the mirror does); never the
-- owner's name, which C24 withholds once a call-out is declined or cancelled, while an SMS stays
-- on the phone. The host is Vault 'app.site_url'
-- (https://<host>, no path); without a valid one the text goes out without the link. The reword
-- has its own exception block: a failure there keeps the generic text and never costs the bell.
-- Generated from the live body of 20261001093200; the bell text is unchanged.

CREATE OR REPLACE FUNCTION public.notify_cleaner_of_new_task()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_title text;
  v_when text;
  v_notif uuid;
  v_site text;
BEGIN
  IF NEW.cleaner_id IS NULL THEN RETURN NEW; END IF;
  SELECT title INTO v_title FROM public.properties WHERE id = NEW.property_id;
  v_title := COALESCE(
    NULLIF(btrim(regexp_replace(v_title, U&'[\0001-\0020\007F-\00A0\00AD\034F\061C\115F\1160\1680\17B4\17B5\180E\2000-\200B\200E\200F\2028-\202F\205F-\206F\2800\3000\3164\FEFF\FFA0\FFF9-\FFFC\+0E0001\+0E0020-\+0E007F]+', ' ', 'g')), ''),
    'ობიექტი'
  );
  v_when := to_char(NEW.scheduled_at AT TIME ZONE 'Asia/Tbilisi', 'DD.MM HH24:MI');
  INSERT INTO public.notifications (user_id, type, title, message, action_url, dashboard_scope)
  VALUES (NEW.cleaner_id, 'cleaning_task_new', 'ახალი გამოძახება',
    v_title || ' • ' || v_when
      || COALESCE(
        ' • ' || NULLIF(
          left(btrim(regexp_replace(NEW.address, U&'[\0001-\0020\007F-\00A0\00AD\034F\061C\115F\1160\1680\17B4\17B5\180E\2000-\200B\200E\200F\2028-\202F\205F-\206F\2800\3000\3164\FEFF\FFA0\FFF9-\FFFC\+0E0001\+0E0020-\+0E007F]+', ' ', 'g')), 80),
          ''
        ),
        ''
      ),
    '/dashboard/cleaner', 'cleaner')
  RETURNING id INTO v_notif;

  -- The SMS the mirror queued for this notice (none when it skipped it).
  BEGIN
    SELECT rtrim(btrim(decrypted_secret), '/') INTO v_site
      FROM vault.decrypted_secrets WHERE name = 'app.site_url';
    IF v_site !~ '^https://[a-z0-9.-]+$' THEN
      v_site := NULL;
    END IF;
    UPDATE public.sms_outbound
       SET message = 'MyBakuriani: ახალი გამოძახება — '
         || CASE WHEN char_length(v_title) > 25 THEN btrim(left(v_title, 24)) || '…' ELSE v_title END
         || ', ' || v_when
         || COALESCE('. დეტალები: ' || v_site || '/dashboard/cleaner', '')
     WHERE source_notification_id = v_notif
       AND automation_kind = 'notification'
       AND status = 'approved';
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'notify_cleaner_of_new_task: generic SMS kept for task %: %', NEW.id, SQLERRM;
  END;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'notify_cleaner_of_new_task failed for task %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

NOTIFY pgrst, 'reload schema';
