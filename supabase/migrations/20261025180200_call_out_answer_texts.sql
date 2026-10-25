-- Cleaner call-out answers say exactly what the owner's technical task (2026-10-25) lists. The SMS is
-- 'MyBakuriani: ' + title (C18), so the six host-side titles become those sentences; the bell/e-mail
-- line under them names the apartment and time instead of repeating the title. The mirror's one-part
-- cap (57) stays for every other type; cleaning_task_status may use two parts ("refused to cancel" is
-- 73 characters). Recipients, types, scopes and links are unchanged.

do $guard$
declare v text;
begin
  select md5(prosrc) into v from pg_proc where oid = 'public.notify_owner_of_task_status()'::regprocedure;
  if v is distinct from '82b12fdcb4af275633401c3e4817eba4' then
    raise exception 'call_out_answer_texts: public.notify_owner_of_task_status() differs from the reviewed body (md5 %); regenerate this migration from the live definition', v
      using errcode = '55000';
  end if;
  select md5(prosrc) into v from pg_proc where oid = 'public.notifications_enqueue_sms()'::regprocedure;
  if v is distinct from '36bb40f72330fa58f638e9efe626e121' then
    raise exception 'call_out_answer_texts: public.notifications_enqueue_sms() differs from the reviewed body (md5 %); regenerate this migration from the live definition', v
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
  v_place text;
  v_when text;
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
    SELECT title INTO v_place FROM public.properties WHERE id = NEW.property_id;
    v_place := COALESCE(
      NULLIF(public._notice_text(btrim(regexp_replace(v_place, U&'[\0001-\0020\007F-\00A0\00AD\034F\061C\115F\1160\1680\17B4\17B5\180E\2000-\200B\200E\200F\2028-\202F\205F-\206F\2800\3000\3164\FEFF\FFA0\FFF9-\FFFC\+0E0001\+0E0020-\+0E007F]+', ' ', 'g'))), ''),
      'ობიექტი'
    );
    v_when := to_char(NEW.scheduled_at AT TIME ZONE 'Asia/Tbilisi', 'DD.MM HH24:MI');
    -- The title is the exact SMS sentence (the mirror texts 'MyBakuriani: ' + title, C18); the
    -- bell/e-mail line under it names the apartment and time.
    IF OLD.status = 'pending' AND NEW.status = 'accepted' THEN
      v_title := 'დამლაგებელმა დაადასტურა გამოძახება.';
      v_msg := concat_ws(' • ', v_place, v_when);
    ELSIF NEW.status = 'declined' THEN
      v_title := 'დამლაგებელმა უარყო გამოძახება.';
      v_msg := concat_ws(' • ', v_place, v_when);
    ELSIF OLD.status = 'cancellation_requested' AND NEW.status = 'cancelled' THEN
      v_title := 'დამლაგებელი დაეთანხმა გამოძახების გაუქმებას.';
      v_msg := concat_ws(' • ', v_place, v_when);
    ELSIF OLD.status = 'cancellation_requested' AND NEW.status = 'accepted' THEN
      v_title := 'დამლაგებელი არ დაეთანხმა გაუქმებას. გამოძახება ძალაში რჩება.';
      v_msg := concat_ws(' • ', v_place, v_when);
    ELSIF NEW.status = 'in_progress' THEN
      v_title := 'დასუფთავება დაიწყო.';
      v_msg := concat_ws(' • ', v_place, v_when);
    ELSIF NEW.status = 'completed' THEN
      v_title := 'დასუფთავება დასრულდა.';
      v_msg := concat_ws(' • ', v_place, v_when);
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
$function$
;

CREATE OR REPLACE FUNCTION public.notifications_enqueue_sms()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_phone text;
  v_title text;
  v_ref uuid;
begin
  if not (new.type = any (public.sms_notification_types())) then
    return null;
  end if;

  begin
    -- The profile number first. An e-mail or Google sign-up has none, so fall back to the number
    -- on the recipient's own listing, never a pending one (typed freely, nobody has reviewed it):
    -- the one the notice links to (a moderated listing, active or blocked: only the admin moderate
    -- route writes that notice, right after it sets the status; a call-out's ?task=, ACTIVE only,
    -- whose cleaner side is the listing the renter called and whose renter side is the apartment),
    -- else their newest active listing in the notice's cabinet, else in any cabinet. No usable
    -- Georgian mobile number anywhere = no SMS (skipped quietly).
    -- A new call-out (cleaning_task_new) is not mirrored: notify_cleaner_of_new_task queues it as
    -- the renter's paid cleaner_call text.
    select public.sms_canonical_ge_phone(p.phone) into v_phone
      from public.profiles p
     where p.id = new.user_id;
    if v_phone is null then
      v_ref := substring(new.action_url from '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}')::uuid;
      if v_ref is not null and new.type = 'listing_moderation' then
        select public.sms_canonical_ge_phone(x.phone) into v_phone
          from (select pr.phone from public.properties pr where pr.id = v_ref and pr.owner_id = new.user_id and pr.status in ('active', 'blocked')
                union all
                select sv.phone from public.services sv where sv.id = v_ref and sv.owner_id = new.user_id and sv.status in ('active', 'blocked')) x
         limit 1;
      elsif v_ref is not null
            and new.type in ('cleaning_task_status', 'cleaning_task_cancelled', 'cleaning_task_cancellation_requested') then
        select public.sms_canonical_ge_phone(case when new.dashboard_scope = 'cleaner' then sv.phone else pr.phone end)
          into v_phone
          from public.cleaning_tasks t
          left join public.services sv on sv.id = t.cleaner_service_id and sv.owner_id = new.user_id and sv.status = 'active'
          left join public.properties pr on pr.id = t.property_id and pr.owner_id = new.user_id and pr.status = 'active'
         where t.id = v_ref
           and new.user_id = case when new.dashboard_scope = 'cleaner' then t.cleaner_id else t.owner_id end;
      end if;
      if v_phone is null then
        select x.phone into v_phone
          from (select public.sms_canonical_ge_phone(pr.phone) as phone, pr.created_at, pr.id,
                       public.dashboard_scope_for_listing(pr.id, null, new.user_id) as scope
                  from public.properties pr
                 where pr.owner_id = new.user_id and pr.status = 'active'
                union all
                select public.sms_canonical_ge_phone(sv.phone), sv.created_at, sv.id,
                       public.dashboard_scope_for_listing(null, sv.id, new.user_id)
                  from public.services sv
                 where sv.owner_id = new.user_id and sv.status = 'active') x
         where x.phone is not null
         order by (x.scope is not distinct from new.dashboard_scope) desc, x.created_at desc, x.id desc
         limit 1;
      end if;
    end if;
    if v_phone is null then
      return null;
    end if;

    -- E2E fixtures (real-format numbers) are never texted.
    if exists (select 1 from auth.users u
                where u.id = new.user_id
                  and lower(u.email) like '%@e2e.mybakuriani.test') then
      return null;
    end if;

    -- Title only, one line, <= 70 chars in total (one UCS-2 segment).
    v_title := btrim(regexp_replace(coalesce(new.title, ''), '\s+', ' ', 'g'));
    if v_title = '' then
      return null;
    end if;
    -- 13 + 57 = one SMS part; a call-out answer is the doc's exact sentence, up to two parts.
    if char_length(v_title) > (case when new.type = 'cleaning_task_status' then 121 else 57 end) then
      v_title := left(v_title, case when new.type = 'cleaning_task_status' then 120 else 56 end) || '…';
    end if;

    -- Serialise per recipient so two concurrent notices cannot both pass the caps.
    -- try-lock, never a blocking wait: a lock wait cancelled by statement_timeout
    -- (57014) escapes WHEN OTHERS and would fail the notification insert. Losing
    -- the race just skips this SMS; the notification itself is unaffected.
    if not pg_try_advisory_xact_lock(hashtextextended('sms_notification:' || new.user_id::text, 19003)) then
      return null;
    end if;

    -- At most 3 per recipient, type AND cabinet (dashboard_scope) per rolling
    -- day, so one role's events cannot starve another role's.
    if (select count(*)
          from public.sms_outbound s
          join public.notifications n on n.id = s.source_notification_id
         where s.automation_kind = 'notification'
           and s.recipient_id = new.user_id
           and s.status <> 'failed'
           and s.created_at > now() - interval '1 day'
           and n.type = new.type
           and n.dashboard_scope is not distinct from new.dashboard_scope) >= 3 then
      return null;
    end if;

    -- And at most 8 notification SMS per recipient per rolling day, whatever the type.
    if (select count(*)
          from public.sms_outbound s
         where s.automation_kind = 'notification'
           and s.recipient_id = new.user_id
           and s.status <> 'failed'
           and s.created_at > now() - interval '1 day') >= 8 then
      return null;
    end if;

    -- Per NUMBER, across accounts and whoever pays (profile and listing numbers are
    -- unverified): call-out texts count too, so one number gets at most 8 a day.
    if not pg_try_advisory_xact_lock(hashtextextended('sms_notification_phone:' || v_phone, 19003)) then
      return null;
    end if;
    if (select count(*)
          from public.sms_outbound s
         where s.automation_kind in ('notification', 'cleaner_call')
           and s.recipient_phone = v_phone
           and s.status <> 'failed'
           and s.created_at > now() - interval '1 day') >= 8 then
      return null;
    end if;

    insert into public.sms_outbound
      (sender_id, recipient_id, recipient_phone, automation_kind, message,
       status, expires_at, source_notification_id)
    values
      (new.user_id, new.user_id, v_phone, 'notification', 'MyBakuriani: ' || v_title,
       'approved', now() + interval '6 hours', new.id)
    on conflict (source_notification_id) do nothing;
  exception when others then
    raise warning 'notifications_enqueue_sms skipped %: % %', new.id, sqlstate, sqlerrm;
  end;
  return null;
end;
$function$
;
