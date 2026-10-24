-- Call-out answers say what happened, in the SMS too (2026-10-24, C18 "Mirror", C24).
--
-- notify_owner_of_task_status gave every answer the host gets (accepted, declined, started,
-- finished, agreed or refused to cancel) the same title, 'დასუფთავების სტატუსი', and only the
-- message said which. The SMS mirror texts 'MyBakuriani: ' + title (C18), so all six reached the
-- host's phone as "MyBakuriani: დასუფთავების სტატუსი". Each case now has its own short title, which
-- the bell, the email subject and the SMS all use:
--   accepted            გამოძახება დადასტურდა
--   declined            გამოძახება უარყოფილია
--   agreed to cancel    გამოძახება გაუქმდა
--   refused to cancel   გაუქმების მოთხოვნა უარყოფილია
--   started             დასუფთავება დაიწყო
--   finished            დასუფთავება დასრულდა
-- The started/finished messages now name the cleaner ('დამლაგებელმა დასუფთავება დაიწყო' /
-- 'დამლაგებელმა დასუფთავება დაასრულა'), so the bell does not show the same line twice. The type,
-- recipients, links, scopes and the two cleaner-side notices are unchanged.
--
-- The body is the live 20261023110000 definition with these edits only; the guard refuses (55000)
-- where the live body differs. Prod: any time (no app or edge function change).

do $guard$
declare
  v_live text := (select md5(p.prosrc) from pg_proc p
                  where p.oid = to_regprocedure('public.notify_owner_of_task_status()'));
begin
  if v_live is distinct from 'd7acb92e0775cf44a2cc0f9b51e265a8' then
    raise exception 'cleaner_call_status_titles: public.notify_owner_of_task_status() differs from the reviewed body (md5 %); regenerate this migration from the live definition', v_live
      using errcode = '55000';
  end if;
end
$guard$;

CREATE OR REPLACE FUNCTION public.notify_owner_of_task_status()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_user_id uuid;
  v_type text := 'cleaning_task_status';
  v_title text;
  v_msg text;
  v_action_url text;
  v_scope text;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  -- ?task= names the call-out, so the SMS mirror texts the number of the listing involved
  -- when the recipient has no profile number (C18).
  IF OLD.status = 'accepted' AND NEW.status = 'cancellation_requested' THEN
    v_user_id := NEW.cleaner_id;
    v_type := 'cleaning_task_cancellation_requested';
    v_title := 'გაუქმების მოთხოვნა';
    v_msg := 'მესაკუთრემ დადასტურებული გამოძახების გაუქმება მოითხოვა';
    v_action_url := '/dashboard/cleaner?task=' || NEW.id;
    v_scope := 'cleaner';
  ELSIF OLD.status = 'pending' AND NEW.status = 'cancelled' THEN
    v_user_id := NEW.cleaner_id;
    v_type := 'cleaning_task_cancelled';
    v_title := 'გამოძახება გაუქმდა';
    v_msg := 'მესაკუთრემ გამოძახება მიღებამდე გააუქმა';
    v_action_url := '/dashboard/cleaner?task=' || NEW.id;
    v_scope := 'cleaner';
  ELSE
    v_user_id := NEW.owner_id;
    v_action_url := '/dashboard/renter/cleaners?task=' || NEW.id;
    v_scope := 'renter';
    -- The title names what happened: the SMS mirror texts only the title (C18).
    IF OLD.status = 'pending' AND NEW.status = 'accepted' THEN
      v_title := 'გამოძახება დადასტურდა';
      v_msg := 'დამლაგებელმა დაადასტურა გამოძახება';
    ELSIF NEW.status = 'declined' THEN
      v_title := 'გამოძახება უარყოფილია';
      v_msg := 'დამლაგებელმა უარყო გამოძახება';
    ELSIF OLD.status = 'cancellation_requested' AND NEW.status = 'cancelled' THEN
      v_title := 'გამოძახება გაუქმდა';
      v_msg := 'დამლაგებელი დაეთანხმა გამოძახების გაუქმებას';
    ELSIF OLD.status = 'cancellation_requested' AND NEW.status = 'accepted' THEN
      v_title := 'გაუქმების მოთხოვნა უარყოფილია';
      v_msg := 'დამლაგებელი არ დაეთანხმა გაუქმებას — გამოძახება ძალაში რჩება';
    ELSIF NEW.status = 'in_progress' THEN
      v_title := 'დასუფთავება დაიწყო';
      v_msg := 'დამლაგებელმა დასუფთავება დაიწყო';
    ELSIF NEW.status = 'completed' THEN
      v_title := 'დასუფთავება დასრულდა';
      v_msg := 'დამლაგებელმა დასუფთავება დაასრულა';
    END IF;
  END IF;

  IF v_user_id IS NULL OR v_msg IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.notifications (
    user_id,
    type,
    title,
    message,
    action_url,
    dashboard_scope
  ) VALUES (
    v_user_id,
    v_type,
    v_title,
    v_msg,
    v_action_url,
    v_scope
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'notify_owner_of_task_status failed for task %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$function$;

-- C34: service_role only (CREATE OR REPLACE keeps the ACL; restated).
REVOKE ALL ON FUNCTION public.notify_owner_of_task_status() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.notify_owner_of_task_status() TO service_role;
