-- 20261006200000_admin_gift_sms_credits.sql
--
-- An admin gives a user SMS credits for free (C44). Before this an admin could
-- gift wallet money (/api/admin/clients/bonus -> topup_balance), memberships,
-- VIP / SUPER VIP, discount badges and company plans (the C44 RPCs), but SMS
-- credits came only from a paid package.
--
-- Writes balances.sms_remaining only. No transactions row: transactions is the
-- money ledger (finance_wallet_reconciliation sums it; finance_wallet_usage
-- and platform_revenue count every sms_package row as a purchase), and a gift
-- moves no money. The balances audit trigger records the change with the admin
-- as actor (the route calls it through createServiceClient(adminId)).
--
-- The notice type sms_credit_admin_update is bell only, like the C44
-- *_admin_update types: it is in neither email_notification_types() nor
-- sms_notification_types().

CREATE OR REPLACE FUNCTION public.admin_gift_sms_credits(
  p_admin_id uuid,
  p_user_id uuid,
  p_credits integer,
  p_note text DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_new integer;
BEGIN
  PERFORM public._admin_status_require_admin(p_admin_id);

  IF p_credits IS NULL OR p_credits < 1 OR p_credits > 10000 THEN
    RAISE EXCEPTION 'ADMIN_GIFT_CREDITS_INVALID' USING ERRCODE = '22023';
  END IF;
  IF v_note IS NOT NULL AND char_length(v_note) > 300 THEN
    RAISE EXCEPTION 'ADMIN_STATUS_NOTE_TOO_LONG' USING ERRCODE = '22023';
  END IF;
  IF p_user_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_user_id) THEN
    RAISE EXCEPTION 'ADMIN_GIFT_USER_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.balances (user_id, amount, sms_remaining)
  VALUES (p_user_id, 0, 0)
  ON CONFLICT (user_id) DO NOTHING;

  UPDATE public.balances
     SET sms_remaining = sms_remaining + p_credits,
         updated_at = now()
   WHERE user_id = p_user_id
  RETURNING sms_remaining INTO v_new;

  -- Scope NULL and a bare /dashboard link, as purchase_package does for an SMS
  -- package: credits are account-wide and shown on every cabinet's balance page.
  PERFORM public._notify(
    p_user_id,
    'sms_credit_admin_update',
    'SMS კრედიტები საჩუქრად',
    format('ადმინისტრაციამ დაგირიცხათ %s SMS კრედიტი.', p_credits)
      || CASE WHEN v_note IS NOT NULL THEN format(' შენიშვნა: %s', v_note) ELSE '' END,
    '/dashboard',
    NULL
  );

  RETURN v_new;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_gift_sms_credits(uuid, uuid, integer, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_gift_sms_credits(uuid, uuid, integer, text) TO service_role;
