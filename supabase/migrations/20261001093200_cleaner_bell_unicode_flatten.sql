-- Round 3 (adversarial review of 20261001093000): the bell text of a new call-out flattened
-- [[:space:][:cntrl:]] in the owner-typed apartment title and address. That leaves bidi overrides
-- (U+202A-202E, U+2066-2069), zero-width and other format characters in the text, and under a "C"
-- collation NBSP, NNBSP, LS, PS and the ideographic space as well (class membership follows the
-- collation). A right-to-left override typed into the title reorders the time and the address in
-- the bell and in the emailed copy ("00:41 01.50"), and a title of one zero-width space defeats the
-- 'ობიექტი' fallback. One explicit class, the same under every collation (written as a U& string so
-- the file holds no invisible characters), replaces both literals; nothing else in the function
-- changes. The class leaves U+200C and U+200D (the joiners) alone: they cannot reorder or break a
-- line, and replacing them with a space would split a family emoji (a ZWJ sequence) or a Persian
-- word. It adds U+2800 (the braille blank), a title that renders as nothing like the Hangul fillers.
-- Staging only so far (prod rollout: see C24).

CREATE OR REPLACE FUNCTION public.notify_cleaner_of_new_task()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_title text;
BEGIN
  IF NEW.cleaner_id IS NULL THEN RETURN NEW; END IF;
  SELECT title INTO v_title FROM public.properties WHERE id = NEW.property_id;
  INSERT INTO public.notifications (user_id, type, title, message, action_url, dashboard_scope)
  VALUES (NEW.cleaner_id, 'cleaning_task_new', 'ახალი გამოძახება',
    COALESCE(
      NULLIF(btrim(regexp_replace(v_title, U&'[\0001-\0020\007F-\00A0\00AD\034F\061C\115F\1160\1680\17B4\17B5\180E\2000-\200B\200E\200F\2028-\202F\205F-\206F\2800\3000\3164\FEFF\FFA0\FFF9-\FFFC\+0E0001\+0E0020-\+0E007F]+', ' ', 'g')), ''),
      'ობიექტი'
    ) || ' • '
      || to_char(NEW.scheduled_at AT TIME ZONE 'Asia/Tbilisi', 'DD.MM HH24:MI')
      || COALESCE(
        ' • ' || NULLIF(
          left(btrim(regexp_replace(NEW.address, U&'[\0001-\0020\007F-\00A0\00AD\034F\061C\115F\1160\1680\17B4\17B5\180E\2000-\200B\200E\200F\2028-\202F\205F-\206F\2800\3000\3164\FEFF\FFA0\FFF9-\FFFC\+0E0001\+0E0020-\+0E007F]+', ' ', 'g')), 80),
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

NOTIFY pgrst, 'reload schema';
