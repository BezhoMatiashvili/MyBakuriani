-- Keepz payments hardening (C32), from the independent security review of
-- 20260925150100. Function bodies are generated from that migration with
-- exact, asserted edits — nothing else in them changed.
--
-- 1. settle_payment (the retired sandbox settle) had no provider filter, and
--    the still-deployed sandbox payment-process edge function passes it a
--    client-chosen payment id: a Keepz row could be settled for free and later
--    credited AGAIN by a real SUCCESS (credited_at stayed NULL). Revoked for
--    every role, service_role included, so the sandbox is dead in the database
--    regardless of TEST_PAYMENTS_ENABLED or which edge bundle is deployed.
-- 2. Only an order WE finished creating at Keepz (checkout_url stored) can be
--    credited. Keepz's status response carries no amount, and whoever creates
--    an order under a given integratorOrderId sets its amount; a SUCCESS for
--    an order we never created is flagged 'unverified_order', never credited.
-- 3. Admins may resolve only 'requested' / 'unknown' refunds, never one Keepz
--    is still processing ('submitted'), which could pay the customer twice.
-- 4. One refund Keepz has registered per payment (retry only after an
--    outright provider rejection): order-level refund statuses cannot tell a
--    second refund from the first.
-- 5. Owners read their own payments through column grants that leave out the
--    provider-internal columns (resume, review_flag, provider_status, …).

REVOKE ALL ON FUNCTION public.settle_payment(uuid, uuid, boolean, text, text, text)
  FROM PUBLIC, anon, authenticated, service_role;

ALTER TABLE public.payments DROP CONSTRAINT IF EXISTS payments_review_flag_check;
ALTER TABLE public.payments ADD CONSTRAINT payments_review_flag_check
  CHECK (review_flag IS NULL OR review_flag IN (
    'external_refund', 'unexpected_refund_status', 'refunded_before_credit',
    'unverified_order'
  ));

REVOKE SELECT ON TABLE public.payments FROM authenticated;
GRANT SELECT (
  id, user_id, amount, currency, purpose, status, provider, return_path,
  card_brand, card_last4, refunded_amount, created_at, completed_at, credited_at
) ON TABLE public.payments TO authenticated;

CREATE OR REPLACE FUNCTION public.keepz_resolve_refund(
  p_refund_id uuid,
  p_outcome text,
  p_provider_status text DEFAULT NULL,
  p_error text DEFAULT NULL,
  p_actor_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_payment_id uuid;
  v_refund public.payment_refunds%ROWTYPE;
BEGIN
  IF p_outcome IS NULL OR p_outcome NOT IN ('succeeded', 'failed') THEN
    RAISE EXCEPTION 'invalid_outcome' USING ERRCODE = '22023';
  END IF;

  -- Lock order everywhere: payment row, then refund row, then balance row.
  SELECT payment_id INTO v_payment_id FROM public.payment_refunds WHERE id = p_refund_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'refund_not_found' USING ERRCODE = 'P0002';
  END IF;
  PERFORM 1 FROM public.payments WHERE id = v_payment_id FOR UPDATE;
  SELECT * INTO v_refund FROM public.payment_refunds WHERE id = p_refund_id FOR UPDATE;

  IF v_refund.status IN ('succeeded', 'failed') THEN
    RETURN jsonb_build_object('status', v_refund.status, 'already_resolved', true);
  END IF;

  -- An admin (p_actor_id set) may only settle refunds whose outcome Keepz
  -- could not report: 'requested' (we never learned whether Keepz got it) and
  -- 'unknown'. A 'submitted' refund is Keepz's to finish — marking it failed
  -- by hand while Keepz completes it would pay the customer twice.
  IF p_actor_id IS NOT NULL AND v_refund.status NOT IN ('requested', 'unknown') THEN
    RAISE EXCEPTION 'refund_not_resolvable' USING ERRCODE = '22023';
  END IF;

  IF p_outcome = 'succeeded' THEN
    UPDATE public.payments
    SET refunded_amount = refunded_amount + v_refund.amount
    WHERE id = v_refund.payment_id;

    PERFORM public._notify(
      v_refund.user_id,
      'payment_refund',
      'თანხა დაბრუნდა ბარათზე',
      format('%s ₾ დაბრუნდა თქვენს ბარათზე.', v_refund.amount),
      '/dashboard',
      NULL
    );
  ELSE
    INSERT INTO public.balances (user_id, amount, sms_remaining)
    VALUES (v_refund.user_id, 0, 0)
    ON CONFLICT (user_id) DO NOTHING;
    UPDATE public.balances
    SET amount = amount + v_refund.amount, updated_at = now()
    WHERE user_id = v_refund.user_id;

    INSERT INTO public.transactions (user_id, amount, type, description, reference_id)
    VALUES (
      v_refund.user_id,
      v_refund.amount,
      'card_refund',
      format('ბარათზე დაბრუნება ვერ შესრულდა — ბალანსი აღდგა: %s ₾', v_refund.amount),
      v_refund.payment_id
    );
  END IF;

  UPDATE public.payment_refunds
  SET status = p_outcome,
      provider_status = COALESCE(p_provider_status, provider_status),
      last_error = p_error,
      resolved_at = now(),
      resolved_by = p_actor_id,
      updated_at = now()
  WHERE id = p_refund_id;

  RETURN jsonb_build_object('status', p_outcome, 'already_resolved', false);
END;
$$;

CREATE OR REPLACE FUNCTION public.keepz_apply_payment_status(
  p_payment_id uuid,
  p_provider_status text,
  p_transaction_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_payment public.payments%ROWTYPE;
  v_refund_id uuid;
  v_status text;
  v_flag text;
  v_credited boolean := false;
  v_outcome text;
BEGIN
  IF p_provider_status IS NULL OR p_provider_status NOT IN (
    'INITIAL', 'PROCESSING', 'SUCCESS', 'FAILED', 'CANCELED', 'EXPIRED',
    'REFUND_REQUESTED', 'PARTIALLY_REFUNDED', 'REFUNDED_BY_OPERATOR',
    'REFUNDED_BY_INTEGRATOR', 'REFUNDED_BY_KEEPZ', 'REFUNDED_FAILED'
  ) THEN
    RAISE EXCEPTION 'unknown_provider_status' USING ERRCODE = '22023';
  END IF;
  IF p_transaction_id IS NOT NULL AND p_transaction_id !~ '^[0-9]{1,20}$' THEN
    RAISE EXCEPTION 'invalid_transaction_id' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_payment
  FROM public.payments
  WHERE id = p_payment_id AND provider = 'keepz'
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'payment_not_found' USING ERRCODE = 'P0002';
  END IF;

  v_status := v_payment.status;
  v_flag := v_payment.review_flag;

  IF p_provider_status = 'SUCCESS' AND v_payment.credited_at IS NULL
     AND v_payment.checkout_url IS NULL THEN
    -- Keepz reports a payment for an order we never finished creating (no
    -- checkout URL stored, so nobody got the link from us). Its amount is
    -- whatever its creator chose, not ours: never credit it automatically.
    v_status := 'cancelled';
    v_flag := 'unverified_order';

  ELSIF p_provider_status = 'SUCCESS' THEN
    IF v_payment.credited_at IS NULL THEN
      PERFORM public.topup_balance(
        v_payment.user_id,
        v_payment.amount,
        'ბალანსის შევსება ბარათით (Keepz)',
        public.dashboard_scope_for_path(v_payment.return_path),
        v_payment.id
      );
      v_credited := true;
    END IF;
    v_status := 'succeeded';

  ELSIF p_provider_status IN ('INITIAL', 'PROCESSING', 'FAILED', 'CANCELED', 'EXPIRED') THEN
    -- A credited payment never moves back; these only describe unpaid orders.
    IF v_payment.credited_at IS NULL THEN
      v_status := CASE p_provider_status
        WHEN 'FAILED' THEN 'declined'
        WHEN 'CANCELED' THEN 'cancelled'
        WHEN 'EXPIRED' THEN 'expired'
        ELSE 'pending'
      END;
    END IF;

  ELSIF v_payment.credited_at IS NULL THEN
    -- A refund state on money we never credited: nothing to credit or debit
    -- automatically; an admin decides.
    v_status := 'cancelled';
    v_flag := 'refunded_before_credit';

  ELSE
    SELECT id INTO v_refund_id
    FROM public.payment_refunds
    WHERE payment_id = v_payment.id AND status = 'submitted';

    IF FOUND THEN
      v_outcome := CASE p_provider_status
        WHEN 'REFUNDED_BY_INTEGRATOR' THEN 'succeeded'
        WHEN 'PARTIALLY_REFUNDED' THEN 'succeeded'
        WHEN 'REFUNDED_FAILED' THEN 'failed'
        ELSE NULL  -- REFUND_REQUESTED: still processing
      END;
      IF v_outcome IS NOT NULL THEN
        PERFORM public.keepz_resolve_refund(v_refund_id, v_outcome, p_provider_status, NULL, NULL);
      ELSIF p_provider_status IN ('REFUNDED_BY_KEEPZ', 'REFUNDED_BY_OPERATOR') THEN
        UPDATE public.payment_refunds
        SET status = 'unknown', provider_status = p_provider_status, updated_at = now()
        WHERE id = v_refund_id;
        v_flag := 'external_refund';
      END IF;
    ELSIF p_provider_status IN ('REFUNDED_BY_KEEPZ', 'REFUNDED_BY_OPERATOR') THEN
      v_flag := 'external_refund';
    ELSIF p_provider_status IN ('PARTIALLY_REFUNDED', 'REFUNDED_BY_INTEGRATOR')
          AND v_payment.refunded_amount > 0 THEN
      NULL;  -- our own completed refund(s)
    ELSIF p_provider_status = 'REFUNDED_FAILED' AND EXISTS (
            SELECT 1 FROM public.payment_refunds
            WHERE payment_id = v_payment.id AND status = 'failed') THEN
      NULL;  -- our own failed refund
    ELSIF p_provider_status = 'REFUND_REQUESTED' AND EXISTS (
            SELECT 1 FROM public.payment_refunds
            WHERE payment_id = v_payment.id AND status IN ('requested', 'unknown')) THEN
      NULL;  -- ours, awaiting acknowledgement or admin resolution
    ELSE
      v_flag := 'unexpected_refund_status';
    END IF;
  END IF;

  UPDATE public.payments
  SET status = v_status,
      provider_status = p_provider_status,
      provider_transaction_id = COALESCE(p_transaction_id, provider_transaction_id),
      last_checked_at = now(),
      credited_at = CASE WHEN v_credited THEN now() ELSE credited_at END,
      completed_at = CASE
        WHEN completed_at IS NULL AND v_status IN ('succeeded', 'cancelled', 'expired')
          THEN now()
        ELSE completed_at
      END,
      last_error = CASE WHEN v_credited THEN NULL ELSE last_error END,
      review_flag = v_flag
  WHERE id = v_payment.id;

  IF v_flag IS NOT NULL AND v_flag IS DISTINCT FROM v_payment.review_flag THEN
    PERFORM public._notify_admins(
      'admin_payment_review',
      'ბარათით გადახდა საჭიროებს შემოწმებას',
      format('Keepz-მა დააბრუნა სტატუსი %s გადახდაზე %s ₾.', p_provider_status, v_payment.amount),
      '/dashboard/admin/payments',
      NULL
    );
  END IF;

  RETURN jsonb_build_object(
    'status', v_status,
    'credited', v_credited,
    'provider_status', p_provider_status,
    'review_flag', v_flag
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.keepz_begin_refund(
  p_payment_id uuid,
  p_amount numeric,
  p_admin_id uuid,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_payment public.payments%ROWTYPE;
  v_balance numeric;
  v_refund_id uuid;
BEGIN
  IF p_admin_id IS NULL THEN
    RAISE EXCEPTION 'admin_required' USING ERRCODE = '42501';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 OR p_amount <> round(p_amount, 2) THEN
    RAISE EXCEPTION 'invalid_amount' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_payment
  FROM public.payments
  WHERE id = p_payment_id AND provider = 'keepz'
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'payment_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF v_payment.credited_at IS NULL OR v_payment.status <> 'succeeded' THEN
    RAISE EXCEPTION 'payment_not_refundable' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.payment_refunds
    WHERE payment_id = p_payment_id
      AND status IN ('requested', 'submitted', 'unknown')
  ) THEN
    RAISE EXCEPTION 'refund_in_flight' USING ERRCODE = '23505';
  END IF;
  -- One refund Keepz has seen, per payment: Keepz reports refund progress per
  -- ORDER, so a second refund could be settled from the first one's stale
  -- status. A retry is allowed only after Keepz refused an attempt outright
  -- (it never registered it, so the order status was left untouched).
  IF EXISTS (
    SELECT 1 FROM public.payment_refunds
    WHERE payment_id = p_payment_id
      AND NOT (status = 'failed' AND coalesce(last_error, '') LIKE 'provider_rejected:%')
  ) THEN
    RAISE EXCEPTION 'refund_already_made' USING ERRCODE = '23505';
  END IF;
  IF p_amount > v_payment.amount - v_payment.refunded_amount THEN
    RAISE EXCEPTION 'refund_exceeds_payment' USING ERRCODE = '22023';
  END IF;

  SELECT amount INTO v_balance
  FROM public.balances
  WHERE user_id = v_payment.user_id
  FOR UPDATE;
  IF v_balance IS NULL OR v_balance < p_amount THEN
    RAISE EXCEPTION 'insufficient_wallet_balance' USING ERRCODE = '22023';
  END IF;

  UPDATE public.balances
  SET amount = amount - p_amount, updated_at = now()
  WHERE user_id = v_payment.user_id;

  INSERT INTO public.payment_refunds (payment_id, user_id, amount, status, requested_by, reason)
  VALUES (p_payment_id, v_payment.user_id, p_amount, 'requested', p_admin_id, NULLIF(btrim(p_reason), ''))
  RETURNING id INTO v_refund_id;

  INSERT INTO public.transactions (user_id, amount, type, description, reference_id)
  VALUES (
    v_payment.user_id,
    -p_amount,
    'card_refund',
    format('ბარათზე დაბრუნება: %s ₾', p_amount),
    p_payment_id
  );

  RETURN jsonb_build_object('refund_id', v_refund_id, 'new_balance', v_balance - p_amount);
END;
$$;

-- Body-only replaces: signatures unchanged, so the service_role-only ACLs from
-- 20260925150100 are preserved.

NOTIFY pgrst, 'reload schema';
