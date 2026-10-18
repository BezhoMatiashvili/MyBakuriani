-- DB clean-up and personal-data retention (s-sec-harden-0926, wave S3; R16 R39 R17 R27).
-- R16/R27: two daily SQL-only pg_cron jobs, 'cron-history-gc' and 'pii-retention-daily'.
-- R39: drops two unused photo backup tables. R17: deleting a profile keeps its Keepz
-- payments and refunds (user_id SET NULL); the Keepz RPCs cope with a NULL payer.
-- Runs after the Keepz migrations (20260925150100-150300).

-- Fail fast rather than queue behind live traffic on the tables altered below.
SET LOCAL lock_timeout = '10s';

-- R16 -----------------------------------------------------------------------
-- pg_cron logs every run and never prunes its history; keep two weeks.
DELETE FROM cron.job_run_details
WHERE coalesce(end_time, start_time) < now() - interval '14 days';

DO $$
BEGIN
  PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'cron-history-gc';
  PERFORM cron.schedule(
    'cron-history-gc',
    '17 3 * * *',
    $cron$DELETE FROM cron.job_run_details WHERE coalesce(end_time, start_time) < now() - interval '14 days'$cron$
  );
END
$$;

-- R39 -----------------------------------------------------------------------
-- Leftovers of the 2026-06 data:-URI to Storage photo move: no PK, policy,
-- dependent object or reader, and the photos now live in Storage.
DROP TABLE IF EXISTS public.properties_photos_backup;
DROP TABLE IF EXISTS public.services_photos_backup;

-- R17 -----------------------------------------------------------------------
-- A deleted profile no longer takes its Keepz money trail with it (C32):
-- payments and refunds stay, with user_id NULL. Whatever FK sits on user_id is
-- replaced under the canonical name, which /api/admin/payments embeds
-- (profiles!payments_user_id_fkey).
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT c.conrelid::regclass AS tbl, c.conname
    FROM pg_constraint c
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
    WHERE c.contype = 'f'
      AND c.conrelid IN ('public.payments'::regclass, 'public.payment_refunds'::regclass)
      AND c.confrelid = 'public.profiles'::regclass
      AND a.attname = 'user_id'
  LOOP
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', r.tbl, r.conname);
  END LOOP;
END
$$;

ALTER TABLE public.payments
  ALTER COLUMN user_id DROP NOT NULL,
  ADD CONSTRAINT payments_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES public.profiles (id) ON DELETE SET NULL;

ALTER TABLE public.payment_refunds
  ALTER COLUMN user_id DROP NOT NULL,
  ADD CONSTRAINT payment_refunds_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES public.profiles (id) ON DELETE SET NULL;

-- A payment whose payer was deleted before Keepz reported SUCCESS used to call
-- topup_balance(NULL) and fail on every sweep; now it is never credited and is
-- parked for an admin (review flag + admin notification). keepz_begin_refund
-- and keepz_resolve_refund are unchanged: they only ever see credited payments,
-- whose payer has a transactions row (NO ACTION) and so cannot be deleted.
CREATE OR REPLACE FUNCTION public.keepz_apply_payment_status(p_payment_id uuid, p_provider_status text, p_transaction_id text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_payment public.payments%ROWTYPE;
  v_refund_id uuid;
  v_status text;
  v_flag text;
  v_credited boolean := false;
  v_outcome text;
  v_error text;
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

  ELSIF p_provider_status = 'SUCCESS' AND v_payment.credited_at IS NULL
        AND v_payment.user_id IS NULL THEN
    -- The payer's profile was deleted before Keepz confirmed (user_id is ON
    -- DELETE SET NULL): there is no wallet to credit. Park it for an admin,
    -- who refunds the card from the Keepz portal.
    v_status := 'cancelled';
    v_flag := 'unverified_order';
    v_error := 'payer_account_deleted';

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
      last_error = CASE WHEN v_credited THEN NULL ELSE COALESCE(v_error, last_error) END,
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
$function$;

-- A replayed checkout request must not match an orphaned payment (NULL-safe).
CREATE OR REPLACE FUNCTION public.keepz_open_payment(p_payment_id uuid, p_user_id uuid, p_amount numeric, p_return_path text, p_resume jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
    IF v_existing.user_id IS DISTINCT FROM p_user_id
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
$function$;

-- R27 -----------------------------------------------------------------------
-- Personal data is kept for p_days (default 90). Rows that feed analytics or
-- admin numbers stay and lose only their personal columns (C22 views and
-- reveals, C26 page views); audit rows keep who/what/when; delivered email is
-- deleted. Notifications are left alone: users see their whole inbox history.
ALTER TABLE public.listing_view_events ALTER COLUMN client_ip DROP NOT NULL;
ALTER TABLE public.contact_reveal_events ALTER COLUMN client_ip DROP NOT NULL;

CREATE OR REPLACE FUNCTION public.apply_pii_retention(p_days integer DEFAULT 90)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_cutoff timestamptz;
  v_views bigint;
  v_reveals bigint;
  v_pages bigint;
  v_audit bigint;
  v_email bigint;
BEGIN
  IF p_days IS NULL OR p_days < 1 THEN
    RAISE EXCEPTION 'invalid_retention_days' USING ERRCODE = '22023';
  END IF;
  v_cutoff := now() - make_interval(days => p_days);

  -- C22: each row is one counted view; only the IP goes. The 24 h view dedup
  -- lives in rate_limit_counters, not here.
  UPDATE public.listing_view_events
  SET client_ip = NULL
  WHERE created_at < v_cutoff AND client_ip IS NOT NULL;
  GET DIAGNOSTICS v_views = ROW_COUNT;

  -- listing_analytics counts every reveal row, lifetime.
  UPDATE public.contact_reveal_events
  SET client_ip = NULL, device_id = NULL, account_id = NULL
  WHERE created_at < v_cutoff
    AND (client_ip IS NOT NULL OR device_id IS NOT NULL OR account_id IS NOT NULL);
  GET DIAGNOSTICS v_reveals = ROW_COUNT;

  -- C26: admin_overview_stats counts rows and distinct visitor_id (a random
  -- first-party cookie id); only the account link goes.
  UPDATE public.page_views
  SET user_id = NULL
  WHERE created_at < v_cutoff AND user_id IS NOT NULL;
  GET DIAGNOSTICS v_pages = ROW_COUNT;

  -- Keep who/what/when/which fields, drop the row snapshots; UPDATE diffs keep
  -- their field names as "[omitted]" (audit_row_change's own marker). Exempt:
  -- manual_bookings (the renter's booking history reads them, C20) and the
  -- money and pricing trail, which holds no contact data.
  UPDATE public.audit_logs
  SET old_values = CASE WHEN operation = 'UPDATE' THEN (
        SELECT jsonb_object_agg(f, '"[omitted]"'::jsonb) FROM unnest(changed_fields) AS f
      ) END,
      new_values = CASE WHEN operation = 'UPDATE' THEN (
        SELECT jsonb_object_agg(f, '"[omitted]"'::jsonb) FROM unnest(changed_fields) AS f
      ) END
  WHERE occurred_at < v_cutoff
    AND old_values IS DISTINCT FROM new_values
    AND table_name <> ALL (ARRAY['manual_bookings', 'balances', 'transactions',
                                 'payment_refunds', 'pricing_packages', 'promocodes']);
  GET DIAGNOSTICS v_audit = ROW_COUNT;

  -- C33: only finished deliveries; queued/sending rows are never touched.
  DELETE FROM public.email_outbound
  WHERE created_at < v_cutoff
    AND status IN ('sent', 'failed', 'suppressed', 'cancelled');
  GET DIAGNOSTICS v_email = ROW_COUNT;

  RETURN jsonb_build_object(
    'cutoff', v_cutoff,
    'listing_view_events_scrubbed', v_views,
    'contact_reveal_events_scrubbed', v_reveals,
    'page_views_scrubbed', v_pages,
    'audit_logs_scrubbed', v_audit,
    'email_outbound_deleted', v_email
  );
END;
$$;

-- C34: pg_cron runs it as the owner; PUBLIC, anon and authenticated may not.
REVOKE ALL ON FUNCTION public.apply_pii_retention(integer) FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
  PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'pii-retention-daily';
  PERFORM cron.schedule(
    'pii-retention-daily',
    '41 2 * * *',
    $cron$SELECT public.apply_pii_retention()$cron$
  );
END
$$;

NOTIFY pgrst, 'reload schema';

-- Expected jobs:
-- cron-history-gc      17 3 * * *
-- pii-retention-daily  41 2 * * *
