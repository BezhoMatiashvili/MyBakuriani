-- SMS never to a pending listing's number (2026-10-23, C18/C24; follow-up to 20261023110000).
--
-- 20261023110000 texts the number on the recipient's own listing when the profile has none, and for
-- the moderated listing and the two listings of a call-out it read that number whatever the
-- listing's status. Every listing a client creates starts pending (force_listing_moderation_state)
-- and stays editable until an admin decides, so a pending number is typed freely and nobody has
-- reviewed it: an e-mail sign-up could put anyone's number on a pending listing, call a cleaner for
-- it (create_cleaning_task checks the cleaner's listing, not the apartment), and have every answer
-- to that call-out texted to that number for free.
--
-- Now:
-- - a call-out answer (?task=, both sides) and the call-out text (notify_cleaner_of_new_task) read
--   only an ACTIVE listing's number (approved; later phone edits go through the C14 review gate, and
--   owners cannot move a listing out of pending or blocked). create_cleaning_task accepts only an
--   active cleaner listing, so the call-out text changes only for a listing taken down later;
-- - a moderation notice reads the moderated listing's number when it is active or blocked, never
--   pending: only the admin moderate route writes that notice (clients cannot insert notifications:
--   prevent_notification_mutation, no client INSERT policy), right after it sets the status, so each
--   such text costs an admin's decision, and a first listing's rejection still reaches its owner.
--
-- Both bodies are the live 20261023110000 definitions with these edits only; the guard refuses
-- (55000) where a live body differs. Prod: after 20261023110000.

do $guard$
declare
  r record;
begin
  for r in
    select v.fn, v.expected,
           (select md5(p.prosrc) from pg_proc p where p.oid = to_regprocedure(v.fn)) as live
    from (values
      ('public.notifications_enqueue_sms()', 'b36f67dbb71616d19dadff17701b26a5'),
      ('public.notify_cleaner_of_new_task()', 'fbe6cde1f454cc42b8d0900423864e18')
    ) as v(fn, expected)
  loop
    if r.live is distinct from r.expected then
      raise exception 'sms_never_pending_listing_numbers: % differs from the reviewed body (md5 %); regenerate this migration from the live definition', r.fn, r.live
        using errcode = '55000';
    end if;
  end loop;
end
$guard$;

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
    if char_length(v_title) > 57 then
      v_title := left(v_title, 56) || '…';
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
$function$;

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
  v_phone text;
  v_credits integer;
  v_reserved integer;
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

  -- The call-out SMS (C18/C24): the renter pays 1 credit for it (kind cleaner_call, taken when
  -- uBill accepts the text). It goes to the cleaner's profile number, else to the number on the
  -- listing the renter called, else on their newest other cleaning listing; only an ACTIVE
  -- listing's number (reviewed by an admin) is ever texted. No free credit, no number, an e2e
  -- account, a 4th text from the same renter to the same cleaner in a day, or a busy or capped
  -- number = no SMS; the bell notice above stays. Try-locks only: a lock wait cancelled by
  -- statement_timeout (57014) escapes WHEN OTHERS and would fail the renter's call-out.
  BEGIN
    SELECT public.sms_canonical_ge_phone(p.phone) INTO v_phone
      FROM public.profiles p WHERE p.id = NEW.cleaner_id;
    IF v_phone IS NULL THEN
      SELECT public.sms_canonical_ge_phone(s.phone) INTO v_phone
        FROM public.services s
       WHERE s.owner_id = NEW.cleaner_id
         AND s.category = 'cleaning'
         AND s.status = 'active'
         AND public.sms_canonical_ge_phone(s.phone) IS NOT NULL
       ORDER BY (s.id IS NOT DISTINCT FROM NEW.cleaner_service_id) DESC, s.created_at DESC, s.id DESC
       LIMIT 1;
    END IF;
    IF v_phone IS NULL
       OR EXISTS (SELECT 1 FROM auth.users u
                   WHERE u.id = NEW.cleaner_id
                     AND lower(u.email) LIKE '%@e2e.mybakuriani.test') THEN
      RETURN NEW;
    END IF;

    -- The renter's free credits: the balance minus the texts still waiting for their charge
    -- (the same reservation sms_claim_dispatch_batch makes before it sends).
    SELECT b.sms_remaining INTO v_credits FROM public.balances b WHERE b.user_id = NEW.owner_id;
    SELECT count(*)::integer INTO v_reserved FROM public.sms_outbound s
     WHERE s.sender_id = NEW.owner_id
       AND s.status IN ('approved', 'submitted')
       AND s.charged_at IS NULL
       AND (s.automation_kind IN ('check_in','review_request','win_back','price_drop','consent_request','cleaner_call')) IS TRUE;
    IF coalesce(v_credits, 0) - v_reserved < 1 THEN
      RETURN NEW;
    END IF;

    -- At most 3 call-out texts a day from one renter to one cleaner (the mirror's per-type cap
    -- before), so one renter cannot use up the number's 8 and silence the cleaner's other texts.
    -- enforce_cleaner_schedule_slot's lock serialises the call-outs to one cleaner.
    IF (SELECT count(*)
          FROM public.sms_outbound s
         WHERE s.automation_kind = 'cleaner_call'
           AND s.sender_id = NEW.owner_id
           AND s.recipient_id = NEW.cleaner_id
           AND s.status <> 'failed'
           AND s.created_at > now() - interval '1 day') >= 3 THEN
      RETURN NEW;
    END IF;

    -- At most 8 texts a day to one number, whoever pays (a listing number is typed, not verified).
    IF NOT pg_try_advisory_xact_lock(hashtextextended('sms_notification_phone:' || v_phone, 19003)) THEN
      RETURN NEW;
    END IF;
    IF (SELECT count(*)
          FROM public.sms_outbound s
         WHERE s.automation_kind IN ('notification', 'cleaner_call')
           AND s.recipient_phone = v_phone
           AND s.status <> 'failed'
           AND s.created_at > now() - interval '1 day') >= 8 THEN
      RETURN NEW;
    END IF;

    SELECT rtrim(btrim(decrypted_secret), '/') INTO v_site
      FROM vault.decrypted_secrets WHERE name = 'app.site_url';
    IF v_site !~ '^https://[a-z0-9.-]+$' THEN
      v_site := NULL;
    END IF;
    -- Expires an hour after the cleaning starts at the latest; sms_cancel_resolved_cleaner_calls
    -- drops it once the call-out is answered or cancelled before it went out.
    INSERT INTO public.sms_outbound
      (sender_id, recipient_id, recipient_phone, automation_kind, message, status,
       expires_at, source_notification_id, source_cleaning_task_id)
    VALUES
      (NEW.owner_id, NEW.cleaner_id, v_phone, 'cleaner_call',
       'MyBakuriani: ახალი გამოძახება — '
         || CASE WHEN char_length(v_title) > 25 THEN btrim(left(v_title, 24)) || '…' ELSE v_title END
         || ', ' || v_when
         || COALESCE('. დეტალები: ' || v_site || '/dashboard/cleaner', ''),
       'approved', least(now() + interval '6 hours', NEW.scheduled_at + interval '1 hour'),
       v_notif, NEW.id)
    ON CONFLICT DO NOTHING;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'notify_cleaner_of_new_task: no SMS for task %: %', NEW.id, SQLERRM;
  END;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'notify_cleaner_of_new_task failed for task %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$function$;

-- C34: service_role only (CREATE OR REPLACE keeps the ACL; restated).
REVOKE ALL ON FUNCTION public.notifications_enqueue_sms() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.notifications_enqueue_sms() TO service_role;
REVOKE ALL ON FUNCTION public.notify_cleaner_of_new_task() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.notify_cleaner_of_new_task() TO service_role;
