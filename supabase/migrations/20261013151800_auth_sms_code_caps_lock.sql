-- Phone sign-in code caps: the per-IP and site-wide counts under one lock
-- (2026-10-15, C48).
--
-- auth_sms_code_reserve() (called by the auth-send-sms hook for every sign-in or
-- phone-change code) caps codes per number (5/h, 10/24 h), per request IP (20/h,
-- 60/24 h) and site-wide (500/24 h). Only the number had a lock, so concurrent
-- requests for different numbers from one IP each counted before the others
-- committed and all passed the IP and site caps (a rolled-back race reserved a
-- 21st code for one IP; each one is a platform-paid SMS). The counts now run
-- under a second transaction advisory lock, taken after the number's lock (one
-- order, so no deadlock), so a second request waits for the first to commit and
-- counts it. Requests are a few ms each and GoTrue sends at most its hourly SMS
-- limit, so the wait stays far inside the hook's 5 s budget. Legit requests,
-- every cap, the answers and the duplicate-hook path are as before.
--
-- Body = the live staging definition with that one PERFORM added; the guard
-- refuses (55000) where the live body differs. CREATE OR REPLACE keeps the
-- function's ACL (service_role only).

do $guard$
declare
  v_live text;
begin
  select md5(p.prosrc) into v_live
    from pg_proc p
   where p.oid = to_regprocedure('public.auth_sms_code_reserve(uuid, text, text, uuid, text)');
  if v_live is distinct from '886c972d5efdff7054ceceddf475cb58' then
    raise exception 'auth_sms_code_caps_lock: auth_sms_code_reserve() differs from the reviewed body (md5 %); regenerate this migration from the live definition', v_live
      using errcode = '55000';
  end if;
end
$guard$;

CREATE OR REPLACE FUNCTION public.auth_sms_code_reserve(p_hook_id uuid, p_phone text, p_ip text, p_user_id uuid, p_kind text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_ip text := left(nullif(btrim(coalesce(p_ip, '')), ''), 64);
  v_existing public.auth_sms_code_log%ROWTYPE;
  v_id uuid;
BEGIN
  IF p_hook_id IS NULL OR p_phone IS NULL OR p_phone !~ '^9955[0-9]{8}$'
     OR p_kind IS NULL OR p_kind NOT IN ('sign_in', 'phone_change') THEN
    RAISE EXCEPTION 'AUTH_SMS_CODE_INVALID' USING ERRCODE = '22023';
  END IF;

  -- One number's requests are decided one at a time.
  PERFORM pg_advisory_xact_lock(hashtextextended('auth-sms-code:' || p_phone, 0));

  -- The per-IP and site-wide counts below span every number, so they are
  -- decided one request at a time as well: under the number's lock alone,
  -- concurrent requests for different numbers each counted before the others
  -- committed and all passed. Always taken after the number's lock; each
  -- request holds it for a few ms.
  PERFORM pg_advisory_xact_lock(hashtextextended('auth-sms-code-caps', 0));

  SELECT * INTO v_existing FROM public.auth_sms_code_log WHERE hook_id = p_hook_id;
  IF FOUND THEN
    RETURN jsonb_build_object('ok', true, 'duplicate', true, 'id', v_existing.id);
  END IF;

  DELETE FROM public.auth_sms_code_log WHERE created_at < now() - interval '7 days';

  IF (SELECT count(*) FROM public.auth_sms_code_log
       WHERE phone = p_phone AND status <> 'failed'
         AND created_at > now() - interval '1 hour') >= 5
     OR (SELECT count(*) FROM public.auth_sms_code_log
          WHERE phone = p_phone AND status <> 'failed'
            AND created_at > now() - interval '24 hours') >= 10 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'number_limit');
  END IF;

  IF v_ip IS NOT NULL AND (
       (SELECT count(*) FROM public.auth_sms_code_log
         WHERE ip = v_ip AND status <> 'failed'
           AND created_at > now() - interval '1 hour') >= 20
       OR (SELECT count(*) FROM public.auth_sms_code_log
            WHERE ip = v_ip AND status <> 'failed'
              AND created_at > now() - interval '24 hours') >= 60) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'ip_limit');
  END IF;

  IF (SELECT count(*) FROM public.auth_sms_code_log
       WHERE status <> 'failed' AND created_at > now() - interval '24 hours') >= 500 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'site_limit');
  END IF;

  INSERT INTO public.auth_sms_code_log (hook_id, user_id, phone, ip, kind)
  VALUES (p_hook_id, p_user_id, p_phone, v_ip, p_kind)
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('ok', true, 'id', v_id);
END;
$function$;
