-- Dummy payment gateway — ledger + settlement
--
-- Adds a `payments` table (the gateway/PSP ledger, distinct from the wallet
-- `transactions` ledger) and a `settle_payment` RPC that atomically transitions
-- a pending payment to succeeded and credits the wallet. This is the seam where
-- a real PSP (TBC/BOG) plugs in later: the edge function decides approve/decline
-- (today via test cards) and calls settle_payment to fulfil.
--
-- Non-destructive: only CREATEs. Rollback at the bottom (commented).

-- ---------------------------------------------------------------------------
-- 1. payments — gateway ledger
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  amount NUMERIC(10,2) NOT NULL CHECK (amount > 0),
  currency TEXT NOT NULL DEFAULT '₾',
  purpose TEXT NOT NULL DEFAULT 'topup',          -- future: 'booking', 'vip'
  reference_id UUID,                              -- future link (e.g. booking id)
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'succeeded', 'declined', 'cancelled')),
  card_brand TEXT,
  card_last4 TEXT,
  return_path TEXT,
  last_error TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_payments_user_created
  ON public.payments (user_id, created_at DESC);

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

-- Owner can read their own payment sessions (the checkout page loads via this).
-- auth.uid() is wrapped in a scalar subselect so the planner evaluates it once
-- (initplan), consistent with the project's RLS perf hardening.
DROP POLICY IF EXISTS "payments_select_own" ON public.payments;
CREATE POLICY "payments_select_own"
  ON public.payments
  FOR SELECT
  USING (user_id = (SELECT auth.uid()));

-- No INSERT/UPDATE/DELETE policies: all writes go through service-role edge
-- functions + the SECURITY DEFINER RPC below (same pattern as balances /
-- transactions).

-- ---------------------------------------------------------------------------
-- 2. settle_payment — atomic state transition + fulfilment
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.settle_payment(
  p_payment_id UUID,
  p_user_id UUID,
  p_approved BOOLEAN,
  p_card_brand TEXT DEFAULT NULL,
  p_card_last4 TEXT DEFAULT NULL,
  p_error TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payment payments%ROWTYPE;
  v_new_balance NUMERIC;
BEGIN
  SELECT * INTO v_payment
  FROM payments
  WHERE id = p_payment_id AND user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'გადახდა ვერ მოიძებნა' USING ERRCODE = 'P0002';
  END IF;

  -- Idempotency: only a pending payment can transition. A re-submit or page
  -- refresh after success returns the existing state WITHOUT crediting again.
  IF v_payment.status <> 'pending' THEN
    RETURN json_build_object('status', v_payment.status, 'already_processed', TRUE);
  END IF;

  IF NOT p_approved THEN
    -- Declined: keep the session pending so the user can retry another card.
    UPDATE payments
    SET last_error = p_error,
        card_brand = COALESCE(p_card_brand, card_brand),
        card_last4 = COALESCE(p_card_last4, card_last4)
    WHERE id = p_payment_id;
    RETURN json_build_object('status', 'declined');
  END IF;

  -- Approved: fulfil by purpose, then mark succeeded (same transaction).
  IF v_payment.purpose = 'topup' THEN
    v_new_balance := topup_balance(
      p_user_id,
      v_payment.amount,
      'ბალანსის შევსება (ბარათით)'
    );
  ELSE
    RAISE EXCEPTION 'გადახდის ტიპი არ არის მხარდაჭერილი: %', v_payment.purpose
      USING ERRCODE = '22023';
  END IF;

  UPDATE payments
  SET status = 'succeeded',
      completed_at = NOW(),
      card_brand = COALESCE(p_card_brand, card_brand),
      card_last4 = COALESCE(p_card_last4, card_last4),
      last_error = NULL
  WHERE id = p_payment_id;

  RETURN json_build_object('status', 'succeeded', 'new_balance', v_new_balance);
END;
$$;

-- Lock down: settle_payment must ONLY be callable by the service-role edge
-- function. Supabase's default privileges grant EXECUTE to anon/authenticated
-- on new functions, and REVOKE FROM PUBLIC does NOT remove those role-specific
-- grants — so we revoke them explicitly (matching the purchase_vip convention).
-- Without this, a logged-in user could call settle_payment via PostgREST RPC and
-- credit their own balance without paying.
REVOKE ALL ON FUNCTION public.settle_payment(UUID, UUID, BOOLEAN, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.settle_payment(UUID, UUID, BOOLEAN, TEXT, TEXT, TEXT) TO service_role;

-- ---------------------------------------------------------------------------
-- Rollback (manual):
--   DROP FUNCTION IF EXISTS public.settle_payment(UUID, UUID, BOOLEAN, TEXT, TEXT, TEXT);
--   DROP TABLE IF EXISTS public.payments;
-- ---------------------------------------------------------------------------
