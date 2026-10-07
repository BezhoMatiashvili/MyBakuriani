-- 20261006230000_auth_sms_code_log.sql
--
-- Phone sign-in (C48). Supabase Auth's Send SMS hook (edge function
-- auth-send-sms) sends every sign-in and phone-change code through uBill
-- straight away. Before each send it reserves a row here: that is where the
-- abuse caps live. The code itself is never stored, only that one was sent,
-- to which number, for which request IP.
--
-- Caps (rows not 'failed'; a failed send cost nothing and must not lock a
-- user out): per number 5 an hour and 10 a day, per request IP 20 an hour and
-- 60 a day (Georgian mobile networks put many phones behind one IP), 500 a day
-- site-wide (the cost ceiling). Auth's own per-number 60 s resend limit and
-- its project-wide SMS hourly limit come on top.
--
-- hook_id = the hook payload's metadata.uuid. Auth retries a timed-out call
-- with the same payload, so a second reserve for one hook_id answers
-- duplicate and nothing is sent twice.
--
-- user_id has no foreign key: for a new phone sign-up the hook runs inside
-- Auth's transaction, before the auth.users row is committed.
--
-- Rows are personal data (number + IP) and are deleted after 7 days by the
-- reserve function itself; the caps look back 24 hours.
--
-- Service role only (C34): no grant to anon/authenticated on the table or
-- the functions.

CREATE TABLE public.auth_sms_code_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hook_id uuid NOT NULL UNIQUE,
  user_id uuid,
  phone text NOT NULL CHECK (phone ~ '^9955[0-9]{8}$'),
  ip text CHECK (ip IS NULL OR char_length(ip) <= 64),
  kind text NOT NULL CHECK (kind IN ('sign_in', 'phone_change')),
  status text NOT NULL DEFAULT 'reserved' CHECK (status IN ('reserved', 'sent', 'failed')),
  provider_message_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  settled_at timestamptz
);

CREATE INDEX auth_sms_code_log_phone_idx ON public.auth_sms_code_log (phone, created_at);
CREATE INDEX auth_sms_code_log_ip_idx ON public.auth_sms_code_log (ip, created_at) WHERE ip IS NOT NULL;
CREATE INDEX auth_sms_code_log_created_idx ON public.auth_sms_code_log (created_at);

ALTER TABLE public.auth_sms_code_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.auth_sms_code_log FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.auth_sms_code_reserve(
  p_hook_id uuid,
  p_phone text,
  p_ip text,
  p_user_id uuid,
  p_kind text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
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
$$;

CREATE OR REPLACE FUNCTION public.auth_sms_code_settle(
  p_id uuid,
  p_sent boolean,
  p_provider_message_id text
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  UPDATE public.auth_sms_code_log
     SET status = CASE WHEN p_sent THEN 'sent' ELSE 'failed' END,
         provider_message_id = left(p_provider_message_id, 40),
         settled_at = now()
   WHERE id = p_id AND status = 'reserved';
$$;

REVOKE ALL ON FUNCTION public.auth_sms_code_reserve(uuid, text, text, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.auth_sms_code_reserve(uuid, text, text, uuid, text) TO service_role;
REVOKE ALL ON FUNCTION public.auth_sms_code_settle(uuid, boolean, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.auth_sms_code_settle(uuid, boolean, text) TO service_role;
