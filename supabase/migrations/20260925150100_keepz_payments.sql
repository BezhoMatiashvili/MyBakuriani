-- Keepz payment gateway (C32). A Keepz card payment tops up the wallet; every
-- purchase stays a wallet debit through the unchanged purchase RPCs.
--
-- Money rules enforced here (the routes only ever call these functions):
--   * Only a Keepz status response WE requested moves money: callers pass the
--     status they just fetched from GET /order/status, never callback data.
--   * Exactly-once crediting under the payment row lock, of the STORED amount to
--     the STORED user (credited_at IS NULL guard). A verified SUCCESS credits
--     from any not-yet-credited state, so a real payment is never stranded.
--   * A refund debits the wallet in the same transaction that records it,
--     BEFORE Keepz is called; one refund in flight per payment.
-- Every function is SECURITY DEFINER with an empty search_path and is
-- executable by service_role only.
--
-- Backward compatible with the deployed app and sandbox edge functions:
-- provider defaults to 'sandbox', the status CHECK only widens, and
-- topup_balance keeps its parameter names (the admin bonus route calls it with
-- 3 named arguments, settle_payment positionally with 4 — both still resolve).

-- 1. payments: provider bookkeeping -----------------------------------------

ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS provider text NOT NULL DEFAULT 'sandbox',
  ADD COLUMN IF NOT EXISTS provider_status text,
  ADD COLUMN IF NOT EXISTS provider_transaction_id text,
  ADD COLUMN IF NOT EXISTS checkout_url text,
  ADD COLUMN IF NOT EXISTS last_checked_at timestamptz,
  ADD COLUMN IF NOT EXISTS credited_at timestamptz,
  ADD COLUMN IF NOT EXISTS resume jsonb,
  ADD COLUMN IF NOT EXISTS resume_claimed_at timestamptz,
  ADD COLUMN IF NOT EXISTS refunded_amount numeric(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS review_flag text;

ALTER TABLE public.payments DROP CONSTRAINT IF EXISTS payments_status_check;
ALTER TABLE public.payments ADD CONSTRAINT payments_status_check
  CHECK (status IN ('pending', 'succeeded', 'declined', 'cancelled', 'expired'));
ALTER TABLE public.payments ADD CONSTRAINT payments_provider_check
  CHECK (provider IN ('sandbox', 'keepz'));
-- 1–2000 ₾ mirrors src/lib/payments/keepz/amount.ts (MIN/MAX_CARD_TOPUP_TETRI).
ALTER TABLE public.payments ADD CONSTRAINT payments_keepz_amount_check
  CHECK (provider <> 'keepz' OR (amount >= 1 AND amount <= 2000));
ALTER TABLE public.payments ADD CONSTRAINT payments_refunded_amount_check
  CHECK (refunded_amount >= 0 AND refunded_amount <= amount);
ALTER TABLE public.payments ADD CONSTRAINT payments_resume_size_check
  CHECK (resume IS NULL OR octet_length(resume::text) <= 2048);
ALTER TABLE public.payments ADD CONSTRAINT payments_review_flag_check
  CHECK (review_flag IS NULL OR review_flag IN (
    'external_refund', 'unexpected_refund_status', 'refunded_before_credit'
  ));

-- The reconcile sweeper's working set: Keepz payments that can still succeed.
CREATE INDEX IF NOT EXISTS idx_payments_keepz_open
  ON public.payments (created_at)
  WHERE provider = 'keepz' AND status IN ('pending', 'declined');

-- Supabase's default table grants give anon/authenticated every privilege
-- (incl. TRUNCATE, which RLS does not cover). Browsers only ever read their
-- own rows (payments_select_own); every write goes through the functions below.
REVOKE ALL ON TABLE public.payments FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON TABLE public.payments FROM authenticated;

-- 2. payment_refunds ----------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.payment_refunds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id uuid NOT NULL REFERENCES public.payments(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  amount numeric(10,2) NOT NULL CHECK (amount > 0),
  status text NOT NULL DEFAULT 'requested'
    CHECK (status IN ('requested', 'submitted', 'succeeded', 'failed', 'unknown')),
  requested_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  reason text CHECK (reason IS NULL OR char_length(reason) <= 500),
  provider_status text,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  resolved_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL
);

-- One refund in flight per payment: Keepz's order status cannot tell two
-- concurrent refunds apart, so a second one waits for the first to resolve.
CREATE UNIQUE INDEX IF NOT EXISTS payment_refunds_one_in_flight
  ON public.payment_refunds (payment_id)
  WHERE status IN ('requested', 'submitted', 'unknown');
CREATE INDEX IF NOT EXISTS idx_payment_refunds_payment
  ON public.payment_refunds (payment_id, created_at DESC);

-- Admin-only data, read through the service-role admin API. No browser access.
ALTER TABLE public.payment_refunds ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.payment_refunds FROM anon, authenticated;

-- Refunds are admin money actions: record them (and their actor, via the
-- x-actor-id header) in audit_logs like balances and transactions.
DROP TRIGGER IF EXISTS trg_audit_row ON public.payment_refunds;
CREATE TRIGGER trg_audit_row
  AFTER INSERT OR DELETE OR UPDATE ON public.payment_refunds
  FOR EACH ROW EXECUTE FUNCTION public.audit_row_change();

-- 3. topup_balance links the credit to its payment ----------------------------
-- Body unchanged from 20260727160000 except the trailing p_reference_id, which
-- lands in transactions.reference_id so a top-up can be traced to its payment.
-- Live callers checked 2026-09-25 (staging pg_proc + repo grep): settle_payment
-- (positional, 4 args) and src/app/api/admin/clients/bonus/route.ts (named, 3).
-- A new signature inherits no grants, hence the REVOKE/GRANT pair.
DROP FUNCTION IF EXISTS public.topup_balance(uuid, numeric, text, text);

CREATE OR REPLACE FUNCTION public.topup_balance(
  p_user_id UUID,
  p_amount NUMERIC,
  p_description TEXT DEFAULT NULL,
  p_dashboard_scope TEXT DEFAULT NULL,
  p_reference_id UUID DEFAULT NULL
)
RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_amount NUMERIC;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'არასწორი თანხა' USING ERRCODE = '22023';
  END IF;

  IF p_amount > 999999 THEN
    RAISE EXCEPTION 'თანხა აღემატება მაქსიმუმს' USING ERRCODE = '22023';
  END IF;

  -- Lock the user's balance row (create if missing)
  INSERT INTO balances (user_id, amount, sms_remaining)
  VALUES (p_user_id, 0, 0)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT amount INTO v_new_amount
  FROM balances
  WHERE user_id = p_user_id
  FOR UPDATE;

  v_new_amount := COALESCE(v_new_amount, 0) + p_amount;

  UPDATE balances
  SET amount = v_new_amount, updated_at = NOW()
  WHERE user_id = p_user_id;

  INSERT INTO transactions (user_id, amount, type, description, reference_id)
  VALUES (
    p_user_id,
    p_amount,
    'topup',
    COALESCE(p_description, format('ბალანსის შევსება: %s ₾', p_amount)),
    p_reference_id
  );

  PERFORM public._notify(
    p_user_id,
    'payment_success',
    'ბალანსი შეივსო',
    format('თქვენი ბალანსი შეივსო %s ₾-ით.', p_amount),
    '/dashboard',
    p_dashboard_scope
  );

  RETURN v_new_amount;
END;
$$;

REVOKE ALL ON FUNCTION public.topup_balance(uuid, numeric, text, text, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.topup_balance(uuid, numeric, text, text, uuid)
  TO service_role;

-- 4. keepz_open_payment --------------------------------------------------------
-- Records a pending Keepz order before Keepz is called. p_payment_id is the
-- client's idempotency key (a UUID v4) and becomes Keepz's integratorOrderId:
-- an exact replay returns the existing row; any other reuse is a conflict, with
-- the same error whether or not the id belongs to someone else (no oracle).
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
  IF p_amount IS NULL OR p_amount < 1 OR p_amount > 2000
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

-- 5. keepz_resolve_refund ------------------------------------------------------
-- Final outcome of a refund, from the status sweep (submitted refunds) or an
-- admin resolving an 'unknown' one. Idempotent. 'failed' gives the wallet back.
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

-- 6. keepz_apply_payment_status -----------------------------------------------
-- The ONE place a Keepz status becomes money. p_provider_status must come from
-- our own GET /order/status call. Credits once; resolves an in-flight refund;
-- flags refund states nobody here asked for (never debits on its own).
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

  IF p_provider_status = 'SUCCESS' THEN
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

-- 7. keepz_begin_refund --------------------------------------------------------
-- Debits the wallet and records the refund BEFORE Keepz is asked, so the same
-- credit cannot be spent while the card refund is in flight. Capped at what
-- is left of the payment AND at the wallet balance.
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

-- 8. keepz_update_refund -------------------------------------------------------
-- Non-final refund states: 'submitted' once Keepz acknowledged REFUND_REQUESTED,
-- 'unknown' when the call's outcome could not be established (timeout). An
-- unknown refund is never retried automatically — an admin resolves it.
CREATE OR REPLACE FUNCTION public.keepz_update_refund(
  p_refund_id uuid,
  p_status text,
  p_provider_status text DEFAULT NULL,
  p_error text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_updated integer;
BEGIN
  IF p_status IS NULL OR p_status NOT IN ('submitted', 'unknown') THEN
    RAISE EXCEPTION 'invalid_refund_status' USING ERRCODE = '22023';
  END IF;

  UPDATE public.payment_refunds
  SET status = p_status,
      provider_status = COALESCE(p_provider_status, provider_status),
      last_error = p_error,
      updated_at = now()
  WHERE id = p_refund_id
    AND status IN ('requested', 'submitted', 'unknown');
  GET DIAGNOSTICS v_updated = ROW_COUNT;

  RETURN jsonb_build_object('updated', v_updated = 1);
END;
$$;

-- 9. Grants: service_role only --------------------------------------------------

REVOKE ALL ON FUNCTION public.keepz_open_payment(uuid, uuid, numeric, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.keepz_apply_payment_status(uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.keepz_begin_refund(uuid, numeric, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.keepz_update_refund(uuid, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.keepz_resolve_refund(uuid, text, text, text, uuid) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.keepz_open_payment(uuid, uuid, numeric, text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.keepz_apply_payment_status(uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.keepz_begin_refund(uuid, numeric, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.keepz_update_refund(uuid, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.keepz_resolve_refund(uuid, text, text, text, uuid) TO service_role;

NOTIFY pgrst, 'reload schema';
