-- One SMS per purchase.
--
-- purchase_package and purchase_vip first write a payment_success notification
-- ("გადახდა წარმატებულია"), whose SMS mirror (notifications_enqueue_sms, C18)
-- queues a text in the same transaction, and then call _enqueue_system_sms for
-- the activation text ("თქვენი VIP გააქტიურდა." / "გამოწერა გააქტიურდა."). A buyer
-- with a phone got both (staging 2026-10-03 11:34:29, one VIP purchase, two
-- texts). The activation text says what was bought, so it stays and the generic
-- copy queued by this transaction is dropped. Top-ups (topup_balance) never call
-- _enqueue_system_sms, so "ბალანსი შეივსო" is unaffected; membership texts
-- (kind 'subscription', review/purchase_renter_membership) write no
-- payment_success, so nothing is dropped there.
--
-- The rows dropped were inserted by this same transaction (created_at = now()),
-- so the dispatcher can never have claimed or sent them.

DO $guard$
BEGIN
  IF (SELECT md5(prosrc) FROM pg_proc
      WHERE oid = 'public._enqueue_system_sms(uuid, text, text)'::regprocedure)
     IS DISTINCT FROM '1099e810adad40bfec8a127b6b7cb407' THEN
    RAISE EXCEPTION 'public._enqueue_system_sms differs from the body this migration extends (20260926160000); regenerate it from the live definition'
      USING ERRCODE = '55000';
  END IF;
END
$guard$;

CREATE OR REPLACE FUNCTION public._enqueue_system_sms(p_user_id uuid, p_kind text, p_message text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  -- The purchase's payment_success notification was mirrored to SMS earlier in
  -- this transaction; this activation text replaces it (one text per purchase).
  IF p_kind IN ('vip_activation', 'subscription') THEN
    DELETE FROM sms_outbound o
     USING notifications n
     WHERE o.recipient_id = p_user_id
       AND o.automation_kind = 'notification'
       AND o.status = 'approved'
       AND o.created_at = now()
       AND n.id = o.source_notification_id
       AND n.type = 'payment_success';
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public._enqueue_system_sms(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._enqueue_system_sms(uuid, text, text) TO service_role;
