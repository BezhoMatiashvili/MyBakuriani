-- Notification + system-SMS helpers, shared by the payment RPCs and the
-- VIP-lifecycle job. Plus an extension of the sms_outbound automation_kind
-- whitelist to cover transactional (system) SMS.
--
-- Non-destructive: only CREATEs functions and swaps one CHECK constraint for a
-- superset. No data is rewritten.

-- ---------------------------------------------------------------------------
-- 1. _notify — insert a single notification row.
--    Called via PERFORM from inside other SECURITY DEFINER functions, so it
--    runs as the owner and bypasses the notifications RLS (no client-facing
--    INSERT policy is added — keeps the smart-match hardening surface intact).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._notify(
  p_user_id    UUID,
  p_type       TEXT,
  p_title      TEXT,
  p_message    TEXT DEFAULT NULL,
  p_action_url TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_user_id IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO notifications (user_id, type, title, message, action_url)
  VALUES (p_user_id, p_type, p_title, p_message, p_action_url);
END;
$$;

REVOKE ALL ON FUNCTION public._notify(UUID, TEXT, TEXT, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._notify(UUID, TEXT, TEXT, TEXT, TEXT)
  TO service_role;

-- ---------------------------------------------------------------------------
-- 2. _enqueue_system_sms — queue a transactional SMS for a user.
--    Looks up the user's phone; no-ops silently if absent (phone is nullable).
--    Inserts directly as status='approved' so sms-dispatch sends it and NO SMS
--    credits are consumed (credits are only deducted in the admin-approval
--    path, which system SMS skip). The user is both sender and recipient,
--    which satisfies the sender_id/recipient_id NOT NULL FKs; automation_kind
--    satisfies sms_outbound_origin_check.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._enqueue_system_sms(
  p_user_id UUID,
  p_kind    TEXT,
  p_message TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_phone TEXT;
BEGIN
  IF p_user_id IS NULL OR p_message IS NULL THEN
    RETURN;
  END IF;

  SELECT phone INTO v_phone FROM profiles WHERE id = p_user_id;

  IF v_phone IS NULL OR v_phone = '' THEN
    RETURN; -- can't text a user with no phone on file
  END IF;

  INSERT INTO sms_outbound (
    sender_id, recipient_id, recipient_phone, automation_kind, message, status
  )
  VALUES (
    p_user_id, p_user_id, v_phone, p_kind, left(p_message, 320), 'approved'
  );
END;
$$;

REVOKE ALL ON FUNCTION public._enqueue_system_sms(UUID, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._enqueue_system_sms(UUID, TEXT, TEXT)
  TO service_role;

-- ---------------------------------------------------------------------------
-- 3. Extend the automation_kind whitelist to cover system SMS kinds.
--    A CHECK can't be altered in place, so drop + recreate as a superset of
--    the original ('check_in','review_request','win_back').
-- ---------------------------------------------------------------------------
ALTER TABLE public.sms_outbound
  DROP CONSTRAINT IF EXISTS sms_outbound_automation_kind_check;

ALTER TABLE public.sms_outbound
  ADD CONSTRAINT sms_outbound_automation_kind_check
  CHECK (
    automation_kind IS NULL OR automation_kind IN (
      'check_in', 'review_request', 'win_back',
      'vip_activation', 'vip_expiry', 'subscription'
    )
  );
