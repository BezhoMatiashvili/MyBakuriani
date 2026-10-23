-- Cleaner call-out SMS paid by the renter + listing numbers for every SMS notice (2026-10-23, C18/C24/C50).
--
-- The owner's report: cleaners and the other service roles get no SMS, and sending one does not take
-- a credit. Found on prod (SELECT-only):
-- - The free notification mirror texts profiles.phone only. Most accounts sign up by e-mail or
--   Google and have none, so moderation, payment, verification, job-application and call-out answer
--   notices to them were dropped silently. The 10-22 fallback covered cleaning_task_new only and
--   picked the cleaner's NEWEST cleaning listing, not the one the renter called.
-- - Call-out texts were kind 'notification', free by design, so the renter's credits never moved.
--
-- The owner's decisions (2026-10-23): a call-out text costs the renter 1 credit, taken when uBill
-- accepts it (like every charged kind since 20261007150000); a renter without a free credit can still
-- call, the cleaner then gets the bell notice only. Every other notice stays free.
--
-- 1. New kind 'cleaner_call', charged like check_in / consent_request in every list C18 names
--    (sms_claim_dispatch_batch x2, sms_mark_claim_submitted, sms_mark_provider_delivered, the consent
--    credit check, sms_expire_stale_automation). Its transaction descriptions carry no number (the
--    renter reads them; the cleaner's profile number is private, C25). sms_finance_category: 'other'.
-- 2. notify_cleaner_of_new_task queues it itself: sender = renter, recipient = cleaner, the cleaner's
--    profile number else the CALLED listing's (cleaning_tasks.cleaner_service_id); renter credit gate,
--    e2e skip, at most 3 a day from one renter to one cleaner, per-number cap (8 a day across
--    'notification' and 'cleaner_call', try-lock). The mirror no longer texts cleaning_task_new
--    (dropped from the mirror's type list): its free row would take the notice's unique
--    source_notification_id first.
-- 3. sms_outbound.source_cleaning_task_id links the text to its call-out; sms_cancel_resolved_cleaner_calls
--    (run by the claim batch) drops a waiting text once the call-out is answered or cancelled.
-- 4. The mirror falls back to a listing number when the profile has none: the listing the notice links
--    to (moderation: view or ?edit= URL; call-out answers: ?task=, which notify_owner_of_task_status
--    now appends), else the newest active listing in the notice's cabinet, else in any cabinet.
--
-- Every function below is the live definition (staging == prod, md5 checked) with these edits, so the
-- guard refuses (55000) where a live body differs. Prod order: deploy the app first (the call-out form
-- tells the renter about the credit), then this migration; regenerate types (new column, C3).

do $guard$
declare
  r record;
begin
  for r in
    select v.fn, v.expected,
           (select md5(p.prosrc) from pg_proc p where p.oid = to_regprocedure(v.fn)) as live
    from (values
      ('public.notifications_enqueue_sms()', '147078040628813234f746540c7bc79c'),
      ('public.notify_cleaner_of_new_task()', '44766e0e3ee956103ab4d44192905a5e'),
      ('public.notify_owner_of_task_status()', '11fe1b7f09c4dd48d23f12755676017d'),
      ('public.sms_claim_dispatch_batch(uuid,integer)', '65eabff3ebdffdf9996893f58049b6e7'),
      ('public.sms_mark_claim_submitted(uuid,uuid,text,jsonb)', '722462cf6e73a985ee7530cd66f7f0a9'),
      ('public.sms_mark_provider_delivered(text,jsonb)', 'fb9cb93db0c78e4be2b4475aef014e98'),
      ('public.sms_mark_provider_undelivered(text,jsonb)', 'f25dc4814545af77d788892b33662b6e'),
      ('public.sms_expire_stale_automation()', 'f2a9a9eb14b0d3ed5b7cffe43956013c'),
      ('public.request_manual_booking_sms_consent(uuid,uuid,text,text,text)', 'e06590421adc2cdd34ba294186ad9a63'),
      ('public.sms_finance_category(text,text,text)', 'f9784c5eb967068b24848f7b687068cc'),
      ('public.sms_notification_types()', '8bbd387ca2f5b0ac249f5bf3cb96cda4')
    ) as v(fn, expected)
  loop
    if r.live is distinct from r.expected then
      raise exception 'cleaner_call_out_paid_sms: % differs from the reviewed body (md5 %); regenerate this migration from the live definition', r.fn, r.live
        using errcode = '55000';
    end if;
  end loop;
end
$guard$;

-- 1. The paid kind.
alter table public.sms_outbound
  drop constraint if exists sms_outbound_automation_kind_check;
alter table public.sms_outbound
  add constraint sms_outbound_automation_kind_check
  check (automation_kind is null or automation_kind = any (array[
    'check_in', 'review_request', 'win_back', 'price_drop',
    'vip_activation', 'vip_expiry', 'subscription', 'consent_request',
    'notification', 'cleaner_call'
  ]));

-- 3. One text per call-out, linked to it.
alter table public.sms_outbound
  add column source_cleaning_task_id uuid references public.cleaning_tasks(id) on delete set null;
create unique index sms_outbound_cleaner_call_task_uidx
  on public.sms_outbound (source_cleaning_task_id)
  where source_cleaning_task_id is not null;

-- 2 + 4. Who gets which text, on which number.
CREATE OR REPLACE FUNCTION public.sms_notification_types()
 RETURNS text[]
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  select array[
    -- money
    'payment_success', 'payment_failed', 'payment_refund',
    -- cleaning calls (a new call-out is the renter's paid cleaner_call text, queued by
    -- notify_cleaner_of_new_task, not this free mirror)
    'cleaning_task_status', 'cleaning_task_cancelled',
    'cleaning_task_cancellation_requested',
    -- Smart Match answer to the guest
    'smart_match_offer',
    -- moderation / verification outcome
    'listing_moderation', 'verification',
    -- hiring
    'job_application'
  ]::text[];
$function$;

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
    -- the recipient typed on their own listing: the one the notice links to (a moderated listing;
    -- a call-out's ?task=, whose cleaner side is the listing the renter called and whose renter
    -- side is the apartment), else their newest active listing in the notice's cabinet, else in
    -- any cabinet. No usable Georgian mobile number anywhere = no SMS (skipped quietly).
    -- A new call-out (cleaning_task_new) is not mirrored: notify_cleaner_of_new_task queues it as
    -- the renter's paid cleaner_call text.
    select public.sms_canonical_ge_phone(p.phone) into v_phone
      from public.profiles p
     where p.id = new.user_id;
    if v_phone is null then
      v_ref := substring(new.action_url from '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}')::uuid;
      if v_ref is not null and new.type = 'listing_moderation' then
        select public.sms_canonical_ge_phone(x.phone) into v_phone
          from (select pr.phone from public.properties pr where pr.id = v_ref and pr.owner_id = new.user_id
                union all
                select sv.phone from public.services sv where sv.id = v_ref and sv.owner_id = new.user_id) x
         limit 1;
      elsif v_ref is not null
            and new.type in ('cleaning_task_status', 'cleaning_task_cancelled', 'cleaning_task_cancellation_requested') then
        select public.sms_canonical_ge_phone(case when new.dashboard_scope = 'cleaner' then sv.phone else pr.phone end)
          into v_phone
          from public.cleaning_tasks t
          left join public.services sv on sv.id = t.cleaner_service_id and sv.owner_id = new.user_id
          left join public.properties pr on pr.id = t.property_id and pr.owner_id = new.user_id
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
  -- listing the renter called. No free credit, no number, an e2e account, a 4th text from the
  -- same renter to the same cleaner in a day, or a busy or capped number = no SMS; the bell
  -- notice above stays. Try-locks only: a lock wait cancelled by statement_timeout (57014)
  -- escapes WHEN OTHERS and would fail the renter's call-out.
  BEGIN
    SELECT public.sms_canonical_ge_phone(p.phone) INTO v_phone
      FROM public.profiles p WHERE p.id = NEW.cleaner_id;
    IF v_phone IS NULL THEN
      SELECT public.sms_canonical_ge_phone(s.phone) INTO v_phone
        FROM public.services s
       WHERE s.owner_id = NEW.cleaner_id
         AND s.category = 'cleaning'
         AND (s.id = NEW.cleaner_service_id OR s.status = 'active')
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

CREATE OR REPLACE FUNCTION public.notify_owner_of_task_status()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_user_id uuid;
  v_type text := 'cleaning_task_status';
  v_title text := 'დასუფთავების სტატუსი';
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
    v_msg := CASE
      WHEN OLD.status = 'pending' AND NEW.status = 'accepted'
        THEN 'დამლაგებელმა დაადასტურა გამოძახება'
      WHEN NEW.status = 'declined'
        THEN 'დამლაგებელმა უარყო გამოძახება'
      WHEN OLD.status = 'cancellation_requested' AND NEW.status = 'cancelled'
        THEN 'დამლაგებელი დაეთანხმა გამოძახების გაუქმებას'
      WHEN OLD.status = 'cancellation_requested' AND NEW.status = 'accepted'
        THEN 'დამლაგებელი არ დაეთანხმა გაუქმებას — გამოძახება ძალაში რჩება'
      WHEN NEW.status = 'in_progress'
        THEN 'დასუფთავება დაიწყო'
      WHEN NEW.status = 'completed'
        THEN 'დასუფთავება დასრულდა'
      ELSE NULL
    END;
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

-- 3. The canceller (before the claim batch that calls it).
create or replace function public.sms_cancel_resolved_cleaner_calls()
 returns integer
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare v_n integer;
begin
  -- A call-out text still waiting (no free credit yet, delivery paused) is dropped once its
  -- call-out is no longer pending: the cleaner already answered it or the renter cancelled it.
  -- Never charged. A row claimed in the last 15 minutes may be in uBill's hands: left alone.
  update public.sms_outbound s set status = 'failed', dispatch_claim_token = null, dispatch_claimed_at = null,
    provider_response = coalesce(s.provider_response, '{}'::jsonb) || jsonb_build_object('cancelled', 'call_out_resolved')
  from public.cleaning_tasks t
  where s.automation_kind = 'cleaner_call'
    and s.status = 'approved' and s.charged_at is null
    and (s.dispatch_claimed_at is null or s.dispatch_claimed_at < now() - interval '15 minutes')
    and t.id = s.source_cleaning_task_id
    and t.status <> 'pending';
  get diagnostics v_n = row_count;
  return v_n;
end;
$function$;

-- 1. The charged-kind lists and the number-free descriptions.
CREATE OR REPLACE FUNCTION public.sms_claim_dispatch_batch(p_claim_token uuid, p_limit integer DEFAULT 25)
 RETURNS TABLE(id uuid, recipient_phone text, message text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if p_claim_token is null then raise exception 'claim token is required' using errcode='22023'; end if;
  if not pg_try_advisory_xact_lock(hashtextextended('sms_dispatch_claim',19002)) then return; end if;
  perform public.sms_cancel_ineligible_automation();
  perform public.sms_cancel_ineligible_price_drop();
  perform public.sms_cancel_resolved_cleaner_calls();
  return query
  with active_claims as (
    select s.sender_id,count(*)::integer count from public.sms_outbound s
    where s.status in ('approved','submitted') and s.charged_at is null
      and s.automation_kind in ('check_in','review_request','win_back','price_drop','consent_request','cleaner_call')
      and (s.status='submitted' or s.dispatch_claimed_at>=now()-interval '15 minutes') group by s.sender_id
  ), candidates as (
    select s.id,s.sender_id,s.created_at,
      (s.automation_kind in ('check_in','review_request','win_back','price_drop','consent_request','cleaner_call')) is true chargeable
    from public.sms_outbound s where s.status='approved' and s.charged_at is null
      and s.available_at<=now() and (s.expires_at is null or s.expires_at>now())
      and (s.dispatch_claimed_at is null or s.dispatch_claimed_at<now()-interval '15 minutes')
  ), ranked as (
    select c.*,row_number() over(partition by c.sender_id,c.chargeable order by c.created_at,c.id) rn from candidates c
  ), chosen as (
    select r.id from ranked r left join public.balances b on b.user_id=r.sender_id
    left join active_claims a on a.sender_id=r.sender_id
    where r.chargeable is not true or r.rn<=greatest(coalesce(b.sms_remaining,0)-coalesce(a.count,0),0)
    order by r.created_at,r.id limit greatest(coalesce(p_limit,25),0)
  ), claimed as (
    update public.sms_outbound s set dispatch_claim_token=p_claim_token,dispatch_claimed_at=now(),dispatch_attempt_count=s.dispatch_attempt_count+1
    from chosen c where s.id=c.id returning s.id,s.recipient_phone,s.message
  ) select c.id,c.recipient_phone,c.message from claimed c;
end;
$function$;

CREATE OR REPLACE FUNCTION public.sms_mark_claim_submitted(p_sms_id uuid, p_claim_token uuid, p_provider_message_id text, p_provider_response jsonb DEFAULT NULL::jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_row public.sms_outbound%rowtype; v_remaining integer; v_charged boolean:=false;
begin
  if nullif(btrim(p_provider_message_id),'') is null then raise exception 'provider message id required' using errcode='22023'; end if;
  select * into v_row from public.sms_outbound
  where id=p_sms_id and status='approved' and dispatch_claim_token=p_claim_token for update;
  if not found then raise exception 'sms claim not found' using errcode='P0002'; end if;
  if v_row.automation_kind in ('check_in','review_request','win_back','price_drop','consent_request','cleaner_call') and v_row.charged_at is null then
    select sms_remaining into v_remaining from public.balances where user_id=v_row.sender_id for update;
    if found and coalesce(v_remaining,0)>=1 then
      update public.balances set sms_remaining=v_remaining-1,updated_at=now() where user_id=v_row.sender_id;
      insert into public.transactions(user_id,amount,type,description,reference_id)
      values(v_row.sender_id,0,'sms_send'::public.transaction_type,case when v_row.automation_kind in ('price_drop','cleaner_call') then format('SMS გაგზავნილია (%s)',v_row.automation_kind) else format('SMS გაგზავნილია (%s): %s',v_row.automation_kind,v_row.recipient_phone) end,v_row.id);
      v_charged:=true;
    end if;
  end if;
  update public.sms_outbound set status='submitted',provider_message_id=p_provider_message_id,
    submitted_at=now(),dispatch_claim_token=null,dispatch_claimed_at=null,
    charged_at=case when v_charged then now() else charged_at end,
    provider_response=coalesce(p_provider_response,'{}'::jsonb)
  where id=v_row.id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.sms_mark_provider_delivered(p_provider_message_id text, p_provider_response jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_row public.sms_outbound%rowtype; v_remaining integer; v_charged boolean:=false;
begin
  select * into v_row from public.sms_outbound where provider_message_id=p_provider_message_id for update;
  if not found then raise exception 'provider message not found' using errcode='P0002'; end if;
  if v_row.status='sent' then return jsonb_build_object('delivered',true,'charged',false,'duplicate',true); end if;
  if v_row.status<>'submitted' then raise exception 'message is not submitted' using errcode='22023'; end if;
  if v_row.automation_kind in ('check_in','review_request','win_back','price_drop','consent_request','cleaner_call') and v_row.charged_at is null then
    select sms_remaining into v_remaining from public.balances where user_id=v_row.sender_id for update;
    if found and coalesce(v_remaining,0)>=1 then
      update public.balances set sms_remaining=v_remaining-1,updated_at=now() where user_id=v_row.sender_id;
      insert into public.transactions(user_id,amount,type,description,reference_id)
      values(v_row.sender_id,0,'sms_send'::public.transaction_type,case when v_row.automation_kind in ('price_drop','cleaner_call') then format('SMS მიწოდებულია (%s)',v_row.automation_kind) else format('SMS მიწოდებულია (%s): %s',v_row.automation_kind,v_row.recipient_phone) end,v_row.id);
      v_charged:=true;
    end if;
  end if;
  update public.sms_outbound set status='sent',sent_at=now(),delivered_at=now(),
    charged_at=case when v_charged then now() else charged_at end,
    provider_response=coalesce(provider_response,'{}'::jsonb)||coalesce(p_provider_response,'{}'::jsonb)
  where id=v_row.id;
  return jsonb_build_object('delivered',true,'charged',v_charged,'duplicate',false);
end;
$function$;

CREATE OR REPLACE FUNCTION public.sms_mark_provider_undelivered(p_provider_message_id text, p_provider_response jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_row public.sms_outbound%rowtype; v_reported_failure boolean; v_refunded boolean := false;
begin
  select * into v_row from public.sms_outbound
  where provider_message_id = p_provider_message_id for update;
  if not found then raise exception 'provider message not found' using errcode = 'P0002'; end if;
  if v_row.status = 'failed' then return jsonb_build_object('undelivered', true, 'duplicate', true); end if;
  if v_row.status <> 'submitted' then
    return jsonb_build_object('undelivered', false, 'ignored', v_row.status);
  end if;

  -- uBill report statusID 2 = not delivered, 4 = error. Anything else here is the
  -- poll's 3-day expiry without a final report: uBill accepted the message and
  -- never said it failed, so a charged row keeps its credit.
  v_reported_failure := coalesce(p_provider_response->>'report_status', '') in ('2', '4');
  if not v_reported_failure and v_row.charged_at is not null then
    update public.sms_outbound
    set status = 'sent',
        sent_at = coalesce(sent_at, now()),
        provider_response = coalesce(provider_response, '{}'::jsonb) || coalesce(p_provider_response, '{}'::jsonb)
    where id = v_row.id;
    return jsonb_build_object('undelivered', false, 'kept_charge', true, 'duplicate', false);
  end if;

  if v_row.charged_at is not null then
    update public.balances set sms_remaining = sms_remaining + 1, updated_at = now()
    where user_id = v_row.sender_id;
    if found then
      insert into public.transactions(user_id, amount, type, description, reference_id)
      values (v_row.sender_id, 0, 'sms_send'::public.transaction_type,
        case when v_row.automation_kind in ('price_drop', 'cleaner_call')
          then format('SMS ვერ მიეწოდა, კრედიტი დაბრუნდა (%s)', v_row.automation_kind)
          else format('SMS ვერ მიეწოდა, კრედიტი დაბრუნდა (%s): %s', v_row.automation_kind, v_row.recipient_phone)
        end, v_row.id);
      v_refunded := true;
    end if;
  end if;

  update public.sms_outbound
  set status = 'failed',
      charged_at = case when v_refunded then null else charged_at end,
      provider_response = coalesce(provider_response, '{}'::jsonb) || coalesce(p_provider_response, '{}'::jsonb)
        || case when v_refunded then jsonb_build_object('credit_refunded', true) else '{}'::jsonb end
  where id = v_row.id;
  return jsonb_build_object('undelivered', true, 'refunded', v_refunded, 'duplicate', false);
end;
$function$;

CREATE OR REPLACE FUNCTION public.sms_expire_stale_automation()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_n integer;
begin
  perform pg_advisory_xact_lock(hashtextextended('sms_dispatch_claim',19002));
  update public.sms_outbound s set status='failed',dispatch_claim_token=null,dispatch_claimed_at=null,
    provider_response=coalesce(s.provider_response,'{}'::jsonb)||jsonb_build_object('expired','window_passed','kind',s.automation_kind)
  where s.status='approved' and s.charged_at is null
    and (s.dispatch_claimed_at is null or s.dispatch_claimed_at<now()-interval '15 minutes')
    and s.automation_kind in ('check_in','review_request','win_back','price_drop','vip_activation','vip_expiry','subscription','consent_request','notification','cleaner_call')
    and (s.expires_at<=now() or (s.expires_at is null and s.created_at<now()-(case s.automation_kind when 'check_in' then interval '36 hours' when 'review_request' then interval '7 days' when 'win_back' then interval '30 days' else interval '2 days' end)));
  get diagnostics v_n=row_count; return v_n;
end;
$function$;

CREATE OR REPLACE FUNCTION public.request_manual_booking_sms_consent(p_owner_id uuid, p_manual_booking_id uuid, p_token_hash text, p_consent_version text, p_message text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_booking public.manual_bookings%rowtype;
  v_phone text;
  v_latest text;
  v_answer public.manual_booking_sms_consents%rowtype;
  v_sms public.sms_outbound%rowtype;
  v_consent public.manual_booking_sms_consents%rowtype;
  v_count integer;
  v_credits integer;
begin
  if p_owner_id is null or p_manual_booking_id is null
    or p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$'
    or nullif(btrim(p_consent_version), '') is null
  then
    raise exception 'invalid consent request' using errcode = '22023';
  end if;
  -- The text must carry the link for exactly this token. Never echo the text
  -- in an error: the token in it is the guest's secret.
  if p_message is null or char_length(p_message) > 320
    or encode(sha256(convert_to(
         substring(p_message from '/sms-consent/([A-Za-z0-9_-]{43})'), 'UTF8')), 'hex')
       is distinct from p_token_hash
  then
    raise exception 'consent message does not match its token' using errcode = '22023';
  end if;

  -- Refusals hold only per-booking, per-owner and per-number locks; the global
  -- dispatch lock is taken further down, on the send path only.
  perform pg_advisory_xact_lock(hashtextextended('manual_sms_consent:' || p_manual_booking_id::text, 19003));
  perform pg_advisory_xact_lock(hashtextextended(p_owner_id::text, 19001));

  select * into v_booking from public.manual_bookings
  where id = p_manual_booking_id and owner_id = p_owner_id;
  if not found then
    raise exception 'booking not found' using errcode = 'P0002';
  end if;
  if v_booking.status = 'cancelled' then
    return jsonb_build_object('ok', false, 'reason', 'cancelled_booking');
  end if;
  v_phone := public.sms_canonical_ge_phone(v_booking.guest_phone);
  if v_phone is null then
    return jsonb_build_object('ok', false, 'reason', 'valid_phone_required');
  end if;
  perform pg_advisory_xact_lock(hashtextextended('manual_sms_consent_phone:' || v_phone, 19003));

  select c.status into v_latest from public.manual_booking_sms_consents c
  where c.manual_booking_id = p_manual_booking_id
  order by c.created_at desc, c.id desc
  limit 1;
  if v_latest = 'accepted' then
    return jsonb_build_object('ok', false, 'reason', 'consent_already_accepted');
  end if;

  -- A guest who declined, or withdrew an acceptance, is not asked again for this
  -- booking and number (judged on the latest link issued to the booking's current
  -- number). Acceptances withdrawn by the manual-sms-v1 retirement below were not
  -- the guest's own withdrawal and may be verified again.
  select c.* into v_answer from public.manual_booking_sms_consents c
  where c.manual_booking_id = p_manual_booking_id
    and c.phone_snapshot = v_phone
  order by c.created_at desc, c.id desc
  limit 1;
  if v_answer.declined_at is not null
    or (v_answer.status = 'revoked' and v_answer.accepted_at is not null
      and v_answer.consent_version is distinct from 'manual-sms-v1')
  then
    return jsonb_build_object('ok', false, 'reason', 'consent_declined');
  end if;

  -- Idempotent repeat: this booking's request is already queued, in flight or
  -- delivered to the same number within 24 hours.
  select * into v_sms from public.sms_outbound s
  where s.sender_id = p_owner_id
    and s.source_manual_booking_id = p_manual_booking_id
    and s.automation_kind = 'consent_request'
    and s.recipient_phone = v_phone
    and s.status in ('approved', 'submitted', 'sent')
    and s.created_at > now() - interval '24 hours';
  if found then
    return jsonb_build_object('ok', true, 'duplicate', true,
      'consent_status', coalesce(v_latest, 'not_requested'),
      'sms_status', v_sms.status, 'requested_at', v_sms.created_at);
  end if;

  -- One consent SMS per number per 24 hours, whoever asks. The refusal is
  -- generic so it does not reveal another host's request.
  if exists (
    select 1 from public.sms_outbound s
    where s.automation_kind = 'consent_request'
      and s.recipient_phone = v_phone
      and s.status in ('approved', 'submitted', 'sent')
      and s.created_at > now() - interval '24 hours'
  ) then
    return jsonb_build_object('ok', false, 'reason', 'phone_rate_limited');
  end if;

  select count(*)::integer into v_count from public.sms_outbound s
  where s.sender_id = p_owner_id
    and s.automation_kind = 'consent_request'
    and s.created_at > now() - interval '24 hours';
  if v_count >= 20 then
    return jsonb_build_object('ok', false, 'reason', 'daily_limit');
  end if;

  -- Billed like the rental automation: unsettled chargeable rows (call-out texts too)
  -- reserve the owner's credits; sms_mark_claim_submitted takes one when uBill accepts.
  select b.sms_remaining into v_credits from public.balances b where b.user_id = p_owner_id;
  select count(*)::integer into v_count from public.sms_outbound s
  where s.sender_id = p_owner_id
    and s.status in ('approved', 'submitted')
    and s.charged_at is null
    and (s.automation_kind in ('check_in','review_request','win_back','price_drop','consent_request','cleaner_call')) is true;
  if coalesce(v_credits, 0) - v_count < 1 then
    return jsonb_build_object('ok', false, 'reason', 'insufficient_sms_credit');
  end if;

  -- Same order as cancel/update/respond: dispatch lock before the booking row
  -- lock that issue_manual_booking_sms_consent takes.
  perform pg_advisory_xact_lock(hashtextextended('sms_dispatch_claim', 19002));

  -- An earlier queued request would deliver a link that is revoked below.
  update public.sms_outbound s
  set status = 'failed',
      dispatch_claim_token = null,
      dispatch_claimed_at = null,
      provider_response = coalesce(s.provider_response, '{}'::jsonb)
        || jsonb_build_object('cancelled', 'guest_sms_consent_reissued')
  where s.sender_id = p_owner_id
    and s.source_manual_booking_id = p_manual_booking_id
    and s.automation_kind = 'consent_request'
    and s.status = 'approved'
    and s.charged_at is null
    and (s.dispatch_claimed_at is null
      or s.dispatch_claimed_at < now() - interval '15 minutes');
  -- Free the one-row-per-booking automation key, as cancel_manual_booking does.
  update public.sms_outbound s
  set source_manual_booking_id = null,
      provider_response = coalesce(s.provider_response, '{}'::jsonb)
        || jsonb_build_object('manual_booking_id', p_manual_booking_id)
  where s.sender_id = p_owner_id
    and s.source_manual_booking_id = p_manual_booking_id
    and s.automation_kind = 'consent_request';

  select * into v_consent from public.issue_manual_booking_sms_consent(
    p_owner_id, p_manual_booking_id, p_token_hash, v_phone, p_consent_version);

  insert into public.sms_outbound (
    sender_id, recipient_id, recipient_phone, contact_event_id, broadcast_id,
    automation_kind, source_manual_booking_id, message, status
  ) values (
    p_owner_id, null, v_phone, null, null,
    'consent_request', p_manual_booking_id, p_message, 'approved'
  ) returning * into v_sms;

  return jsonb_build_object('ok', true, 'duplicate', false,
    'consent_status', v_consent.status,
    'sms_status', v_sms.status, 'requested_at', v_sms.created_at);
end;
$function$;

CREATE OR REPLACE FUNCTION public.sms_finance_category(p_source text, p_kind text, p_notification_type text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  SELECT CASE
    WHEN p_source = 'auth_code' THEN 'otp'
    WHEN p_kind = 'notification' AND p_notification_type = 'smart_match_offer' THEN 'smart_match'
    WHEN p_kind = 'notification' AND p_notification_type IN ('listing_moderation', 'verification') THEN 'listing'
    WHEN p_kind IN ('vip_activation', 'vip_expiry') THEN 'listing'
    WHEN p_kind IN ('price_drop', 'win_back') THEN 'marketing'
    WHEN p_kind IN ('check_in', 'review_request', 'consent_request', 'subscription', 'notification', 'cleaner_call') THEN 'other'
    ELSE 'other'
  END
$function$;

-- C34: service_role only (CREATE OR REPLACE keeps the ACL; restated).
REVOKE ALL ON FUNCTION public.sms_notification_types() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sms_notification_types() TO service_role;
REVOKE ALL ON FUNCTION public.notifications_enqueue_sms() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.notifications_enqueue_sms() TO service_role;
REVOKE ALL ON FUNCTION public.notify_cleaner_of_new_task() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.notify_cleaner_of_new_task() TO service_role;
REVOKE ALL ON FUNCTION public.notify_owner_of_task_status() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.notify_owner_of_task_status() TO service_role;
REVOKE ALL ON FUNCTION public.sms_claim_dispatch_batch(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sms_claim_dispatch_batch(uuid, integer) TO service_role;
REVOKE ALL ON FUNCTION public.sms_mark_claim_submitted(uuid, uuid, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sms_mark_claim_submitted(uuid, uuid, text, jsonb) TO service_role;
REVOKE ALL ON FUNCTION public.sms_mark_provider_delivered(text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sms_mark_provider_delivered(text, jsonb) TO service_role;
REVOKE ALL ON FUNCTION public.sms_mark_provider_undelivered(text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sms_mark_provider_undelivered(text, jsonb) TO service_role;
REVOKE ALL ON FUNCTION public.sms_expire_stale_automation() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sms_expire_stale_automation() TO service_role;
REVOKE ALL ON FUNCTION public.request_manual_booking_sms_consent(uuid, uuid, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.request_manual_booking_sms_consent(uuid, uuid, text, text, text) TO service_role;
REVOKE ALL ON FUNCTION public.sms_finance_category(text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sms_finance_category(text, text, text) TO service_role;
REVOKE ALL ON FUNCTION public.sms_cancel_resolved_cleaner_calls() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sms_cancel_resolved_cleaner_calls() TO service_role;
