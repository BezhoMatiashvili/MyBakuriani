-- Cleaner call-out notices: the owner-typed title and address as plain, link-free text
-- (2026-10-14, C24 / C33).
--
-- notify_cleaner_of_new_task flattens the listing title and the address with the C24
-- class but keeps dots and '://', and cleaning_task_new reaches the cleaner's bell, the
-- mailed copy (C33) and, through the title, the call-out SMS (C18). Both values now also
-- pass through public._notice_text (20261013150800), as the other notification writers'
-- user-typed text does: inner dots become U+2024 and '://' becomes ':/ /', so a typed
-- address or title is never a clickable link. Real titles and addresses read the same;
-- the address is still cut to 80 characters, after the defang.
--
-- Body = the live staging definition with the two values wrapped; the guard refuses
-- (55000) where the live body differs. CREATE OR REPLACE keeps the function's ACL.

do $guard$
declare
  v_live text;
begin
  select md5(p.prosrc) into v_live
    from pg_proc p where p.oid = to_regprocedure('public.notify_cleaner_of_new_task()');
  if v_live is distinct from 'a433bc864314e8cb8c78425dde29194b' then
    raise exception 'call_out_notice_text: notify_cleaner_of_new_task() differs from the reviewed body (md5 %); regenerate this migration from the live definition', v_live
      using errcode = '55000';
  end if;
  if to_regprocedure('public._notice_text(text)') is null then
    raise exception 'call_out_notice_text: public._notice_text(text) is missing; apply 20261013150800 first'
      using errcode = '55000';
  end if;
end
$guard$;

CREATE OR REPLACE FUNCTION public.notify_cleaner_of_new_task()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_title text;
  v_when text;
  v_notif uuid;
  v_site text;
BEGIN
  IF NEW.cleaner_id IS NULL THEN RETURN NEW; END IF;
  SELECT title INTO v_title FROM public.properties WHERE id = NEW.property_id;
  v_title := COALESCE(
    NULLIF(public._notice_text(btrim(regexp_replace(v_title, U&'[\0001-\0020\007F-\00A0\00AD\034F\061C\115F\1160\1680\17B4\17B5\180E\2000-\200B\200E\200F\2028-\202F\205F-\206F\2800\3000\3164\FEFF\FFA0\FFF9-\FFFC\+0E0001\+0E0020-\+0E007F]+', ' ', 'g'))), ''),
    'ობიექტი'
  );
  v_when := to_char(NEW.scheduled_at AT TIME ZONE 'Asia/Tbilisi', 'DD.MM HH24:MI');
  INSERT INTO public.notifications (user_id, type, title, message, action_url, dashboard_scope)
  VALUES (NEW.cleaner_id, 'cleaning_task_new', 'ახალი გამოძახება',
    v_title || ' • ' || v_when
      || COALESCE(
        ' • ' || NULLIF(
          left(public._notice_text(btrim(regexp_replace(NEW.address, U&'[\0001-\0020\007F-\00A0\00AD\034F\061C\115F\1160\1680\17B4\17B5\180E\2000-\200B\200E\200F\2028-\202F\205F-\206F\2800\3000\3164\FEFF\FFA0\FFF9-\FFFC\+0E0001\+0E0020-\+0E007F]+', ' ', 'g'))), 80),
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
$function$;
