-- Lower the Keepz card-payment floor from 1 ₾ to 0.10 ₾ (10 tetri).
--
-- A card payment covers only the part of a purchase the wallet can't, and that
-- shortfall used to be rounded up to 1 ₾. With cheap test prices (0.10 ₾) on
-- staging every card purchase charged 1 ₾. The Keepz dev gateway accepts a
-- 0.10 ₾ order and rejects 0.01 ₾ (6026, amount limit), so 0.10 is the new floor.
-- Mirrors MIN_CARD_TOPUP_TETRI in src/lib/payments/keepz/amount.ts (C32).
-- Before a prod rollout, re-probe the PRODUCTION gateway with a 0.10 ₾ order.
--
-- keepz_open_payment is copied from 20260925150100 with only `p_amount < 1`
-- changed; CREATE OR REPLACE keeps its owner and grants (service_role only).

-- 0.10–2000 ₾ mirrors src/lib/payments/keepz/amount.ts (MIN/MAX_CARD_TOPUP_TETRI).
ALTER TABLE public.payments DROP CONSTRAINT IF EXISTS payments_keepz_amount_check;
ALTER TABLE public.payments ADD CONSTRAINT payments_keepz_amount_check
  CHECK (provider <> 'keepz' OR (amount >= 0.1 AND amount <= 2000));

CREATE OR REPLACE FUNCTION public.keepz_open_payment(
  p_payment_id uuid,
  p_user_id uuid,
  p_amount numeric,
  p_return_path text,
  p_resume jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_existing public.payments%ROWTYPE;
  v_open integer;
BEGIN
  IF p_payment_id IS NULL OR p_user_id IS NULL THEN
    RAISE EXCEPTION 'invalid_request' USING ERRCODE = '22023';
  END IF;
  IF p_amount IS NULL OR p_amount < 0.1 OR p_amount > 2000
     OR p_amount <> round(p_amount, 2) THEN
    RAISE EXCEPTION 'invalid_amount' USING ERRCODE = '22023';
  END IF;
  IF p_return_path IS NOT NULL AND (
       p_return_path !~ '^/dashboard(/|$)' OR char_length(p_return_path) > 300
     ) THEN
    RAISE EXCEPTION 'invalid_return_path' USING ERRCODE = '22023';
  END IF;

  -- Serialize a user's checkouts so the replay check and the open-order cap
  -- cannot be raced by parallel requests.
  PERFORM pg_advisory_xact_lock(hashtextextended('keepz-open:' || p_user_id::text, 0));

  SELECT * INTO v_existing FROM public.payments WHERE id = p_payment_id;
  IF FOUND THEN
    IF v_existing.user_id <> p_user_id
       OR v_existing.provider <> 'keepz'
       OR v_existing.amount <> p_amount
       OR v_existing.return_path IS DISTINCT FROM p_return_path
       OR v_existing.resume IS DISTINCT FROM p_resume THEN
      RAISE EXCEPTION 'payment_id_conflict' USING ERRCODE = '23505';
    END IF;
    RETURN jsonb_build_object(
      'created', false,
      'status', v_existing.status,
      'checkout_url', v_existing.checkout_url
    );
  END IF;

  SELECT count(*) INTO v_open
  FROM public.payments
  WHERE user_id = p_user_id
    AND provider = 'keepz'
    AND status = 'pending'
    AND created_at > now() - interval '30 minutes';
  IF v_open >= 5 THEN
    RAISE EXCEPTION 'too_many_open_orders' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.payments (
    id, user_id, amount, purpose, status, provider, return_path, resume
  ) VALUES (
    p_payment_id, p_user_id, p_amount, 'topup', 'pending', 'keepz',
    p_return_path, p_resume
  );

  RETURN jsonb_build_object('created', true, 'status', 'pending', 'checkout_url', NULL);
END;
$$;
