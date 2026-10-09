-- C50 — SMS financial control (owner spec "SMS Control.docx" §3-§8). STAGING first.
--
-- * sms_provider_purchases: the uBill packages an admin enters by hand (no uBill API).
--   Each one is booked as a Finances expense in the same call (C42: category
--   communications, supplier uBill) and voided only by reversing that expense.
-- * sms_usage_ledger: one durable row per SMS MyBakuriani tried to send, synced from
--   sms_outbound and auth_sms_code_log. Both sources lose rows (sign-in codes after
--   7 days, an account's SMS with the account, unsent mirror rows in
--   _enqueue_system_sms), so the costs cannot be read from them later.
-- * Billed units are computed from the text: uBill reports no part count. GSM-7 = 160
--   per SMS / 153 per part, anything else UCS-2 = 70 / 67 UTF-16 units (Georgian is
--   always UCS-2). A message costs units only once uBill accepted it.
-- * Cost = FIFO over the packages in purchase order; revenue = one credit's average
--   sale price (cumulative SMS package sales up to the send) for every SMS that took
--   an owner's credit; system texts earn 0.
-- * Low-balance warning: an hourly SQL-only job (sms-finance-hourly) syncs and bells
--   the admins once when the remaining units reach the threshold; armed only once a
--   package exists.
-- Prod order: C42 finance batch, 20261007150000 (charge at submit), 20261006230000
-- (auth_sms_code_log), then this file, then the app.

SET LOCAL lock_timeout = '10s';

-- ---------------------------------------------------------------------------
-- Settings: the low-balance threshold lives with the other finance settings.
-- ---------------------------------------------------------------------------
ALTER TABLE public.finance_settings
  ADD COLUMN sms_low_balance_units integer NOT NULL DEFAULT 500,
  ADD COLUMN sms_low_balance_notified_at timestamptz,
  ADD CONSTRAINT finance_settings_sms_low_balance_check
    CHECK (sms_low_balance_units BETWEEN 0 AND 10000000);

-- ---------------------------------------------------------------------------
-- uBill packages (§3)
-- ---------------------------------------------------------------------------
CREATE TABLE public.sms_provider_purchases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_no bigint GENERATED ALWAYS AS IDENTITY,
  purchased_on date NOT NULL,
  units integer NOT NULL,
  amount_gel numeric(12,2) NOT NULL,
  unit_cost numeric(14,6) GENERATED ALWAYS AS (round(amount_gel / nullif(units, 0), 6)) STORED,
  invoice_ref text,
  comment text,
  expense_id uuid NOT NULL REFERENCES public.finance_expenses(id),
  voided_at timestamptz,
  voided_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  void_reason text,
  void_expense_id uuid REFERENCES public.finance_expenses(id),
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sms_provider_purchases_purchase_no_key UNIQUE (purchase_no),
  CONSTRAINT sms_provider_purchases_expense_id_key UNIQUE (expense_id),
  CONSTRAINT sms_provider_purchases_units_check CHECK (units BETWEEN 1 AND 10000000),
  CONSTRAINT sms_provider_purchases_amount_check CHECK (amount_gel > 0 AND amount_gel <= 10000000),
  CONSTRAINT sms_provider_purchases_date_check
    CHECK (purchased_on BETWEEN DATE '2020-01-01' AND DATE '2100-12-31'),
  CONSTRAINT sms_provider_purchases_text_check CHECK (
    char_length(coalesce(invoice_ref, '')) <= 100
    AND char_length(coalesce(comment, '')) <= 1000
    AND char_length(coalesce(void_reason, '')) <= 1000
  ),
  CONSTRAINT sms_provider_purchases_void_check CHECK (
    (voided_at IS NULL) = (void_reason IS NULL)
    AND (voided_at IS NULL) = (void_expense_id IS NULL)
  )
);

-- Rows are never edited: the one void, or an author reference cleared by
-- ON DELETE SET NULL. unit_cost is generated after BEFORE triggers, so it is
-- left out of the comparison.
CREATE OR REPLACE FUNCTION public.sms_provider_purchases_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  c_void constant text[] := ARRAY['voided_at', 'voided_by', 'void_reason', 'void_expense_id', 'unit_cost'];
  c_refs constant text[] := ARRAY['created_by', 'voided_by', 'unit_cost'];
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.created_at := now();
    NEW.voided_at := NULL;
    NEW.voided_by := NULL;
    NEW.void_reason := NULL;
    NEW.void_expense_id := NULL;
    RETURN NEW;
  END IF;
  IF OLD.voided_at IS NULL AND NEW.voided_at IS NOT NULL THEN
    IF (to_jsonb(NEW) - c_void) IS DISTINCT FROM (to_jsonb(OLD) - c_void) THEN
      RAISE EXCEPTION 'FINANCE_RECORD_IMMUTABLE' USING ERRCODE = '55000';
    END IF;
    NEW.voided_at := now();
    RETURN NEW;
  END IF;
  IF (to_jsonb(NEW) - c_refs) IS DISTINCT FROM (to_jsonb(OLD) - c_refs)
     OR (NEW.created_by IS NOT NULL AND NEW.created_by IS DISTINCT FROM OLD.created_by)
     OR (NEW.voided_by IS NOT NULL AND NEW.voided_by IS DISTINCT FROM OLD.voided_by) THEN
    RAISE EXCEPTION 'FINANCE_RECORD_IMMUTABLE' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER sms_provider_purchases_guard
  BEFORE INSERT OR UPDATE ON public.sms_provider_purchases
  FOR EACH ROW EXECUTE FUNCTION public.sms_provider_purchases_guard();

CREATE TRIGGER sms_provider_purchases_forbid_delete
  BEFORE DELETE ON public.sms_provider_purchases
  FOR EACH ROW EXECUTE FUNCTION public.finance_forbid_delete();

CREATE TRIGGER trg_audit_row
  AFTER INSERT OR DELETE OR UPDATE ON public.sms_provider_purchases
  FOR EACH ROW EXECUTE FUNCTION public.audit_row_change();

ALTER TABLE public.sms_provider_purchases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sms_provider_purchases FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.sms_provider_purchases TO service_role;

-- ---------------------------------------------------------------------------
-- Per-SMS ledger (§4). No FK to the sources: they lose rows, the ledger must not.
-- No phone number and no text is copied.
-- ---------------------------------------------------------------------------
CREATE TABLE public.sms_usage_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL,
  source_id uuid NOT NULL,
  kind text NOT NULL,
  notification_type text,
  category text NOT NULL,
  status text NOT NULL,
  sent_at timestamptz NOT NULL,
  segments integer NOT NULL,
  units integer NOT NULL,
  credit_charged boolean NOT NULL DEFAULT false,
  provider_message_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sms_usage_ledger_source_key UNIQUE (source, source_id),
  CONSTRAINT sms_usage_ledger_source_check CHECK (source IN ('outbound', 'auth_code')),
  CONSTRAINT sms_usage_ledger_category_check
    CHECK (category IN ('otp', 'smart_match', 'listing', 'marketing', 'admin', 'other')),
  CONSTRAINT sms_usage_ledger_status_check CHECK (status IN ('sent', 'delivered', 'failed')),
  CONSTRAINT sms_usage_ledger_units_check CHECK (segments >= 0 AND units >= 0 AND units <= segments)
);

CREATE INDEX sms_usage_ledger_sent_at_idx ON public.sms_usage_ledger (sent_at, id);

ALTER TABLE public.sms_usage_ledger ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sms_usage_ledger FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.sms_usage_ledger TO service_role;

-- ---------------------------------------------------------------------------
-- Billed SMS units of a text. GSM-7 when every character is in the GSM 03.38
-- basic table or its extension table (extension characters take 2 septets):
-- 160 in one SMS, 153 per part. Otherwise UCS-2: 70 UTF-16 units in one SMS, 67
-- per part, a character above U+FFFF taking 2 (the same count as JS .length).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sms_billing_units(p_text text)
RETURNS integer
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  c_basic constant text :=
    '@£$¥èéùìòÇØøÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&''()*+,-./0123456789:;<=>?¡'
    || 'ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà'
    || chr(10) || chr(13);
  c_extension constant text := '^{}\[~]|€' || chr(12);
  v_rest text;
  v_len integer;
BEGIN
  IF p_text IS NULL OR p_text = '' THEN
    RETURN 0;
  END IF;
  v_rest := translate(p_text, c_basic, '');
  IF translate(v_rest, c_extension, '') = '' THEN
    v_len := char_length(p_text) + char_length(v_rest);
    RETURN CASE WHEN v_len <= 160 THEN 1 ELSE ceil(v_len / 153.0)::integer END;
  END IF;
  SELECT char_length(p_text) + count(*) FILTER (WHERE ascii(ch) > 65535)
    INTO v_len
    FROM regexp_split_to_table(p_text, '') AS ch;
  RETURN CASE WHEN v_len <= 70 THEN 1 ELSE ceil(v_len / 67.0)::integer END;
END;
$$;

-- ---------------------------------------------------------------------------
-- The one mapping of an SMS to the spec's six types (§6). Every
-- sms_outbound.automation_kind is named here (check-contracts C50); a kind added
-- later without a branch lands in 'other'. 'admin' has no sender yet.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sms_finance_category(p_source text, p_kind text, p_notification_type text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE
    WHEN p_source = 'auth_code' THEN 'otp'
    WHEN p_kind = 'notification' AND p_notification_type = 'smart_match_offer' THEN 'smart_match'
    WHEN p_kind = 'notification' AND p_notification_type IN ('listing_moderation', 'verification') THEN 'listing'
    WHEN p_kind IN ('vip_activation', 'vip_expiry') THEN 'listing'
    WHEN p_kind IN ('price_drop', 'win_back') THEN 'marketing'
    WHEN p_kind IN ('check_in', 'review_request', 'consent_request', 'subscription', 'notification') THEN 'other'
    ELSE 'other'
  END
$$;

-- Ledger status of an sms_outbound row: delivered once uBill confirmed it,
-- failed when the row failed, otherwise sent (accepted, not confirmed).
CREATE OR REPLACE FUNCTION public.sms_finance_outbound_status(p_status text, p_delivered_at timestamptz)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE
    WHEN p_delivered_at IS NOT NULL THEN 'delivered'
    WHEN p_status = 'failed' THEN 'failed'
    ELSE 'sent'
  END
$$;

-- ---------------------------------------------------------------------------
-- Sync (idempotent). An outbound row counts once uBill accepted it, or when a
-- send attempt failed; never-attempted rows (cancelled or expired before a
-- claim) stay out. A notification removed later keeps its recorded type.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._sms_finance_sync_outbound(p_id uuid DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_count integer;
BEGIN
  INSERT INTO public.sms_usage_ledger AS l (
    source, source_id, kind, notification_type, category, status, sent_at,
    segments, units, credit_charged, provider_message_id
  )
  SELECT 'outbound', o.id, k.kind, n.type,
         public.sms_finance_category('outbound', k.kind, n.type),
         public.sms_finance_outbound_status(o.status::text, o.delivered_at),
         coalesce(o.submitted_at, o.dispatch_claimed_at, o.created_at),
         s.segments,
         CASE WHEN o.provider_message_id IS NOT NULL THEN s.segments ELSE 0 END,
         o.charged_at IS NOT NULL,
         o.provider_message_id
  FROM public.sms_outbound o
  CROSS JOIN LATERAL (SELECT coalesce(o.automation_kind, 'legacy') AS kind) k
  CROSS JOIN LATERAL (SELECT public.sms_billing_units(o.message) AS segments) s
  LEFT JOIN public.notifications n ON n.id = o.source_notification_id
  WHERE (p_id IS NULL OR o.id = p_id)
    AND (o.provider_message_id IS NOT NULL
         OR (o.status = 'failed' AND o.dispatch_attempt_count > 0))
  ON CONFLICT (source, source_id) DO UPDATE SET
    kind = EXCLUDED.kind,
    notification_type = coalesce(EXCLUDED.notification_type, l.notification_type),
    category = public.sms_finance_category(
      'outbound', EXCLUDED.kind, coalesce(EXCLUDED.notification_type, l.notification_type)),
    status = EXCLUDED.status,
    sent_at = EXCLUDED.sent_at,
    segments = EXCLUDED.segments,
    units = EXCLUDED.units,
    credit_charged = EXCLUDED.credit_charged,
    provider_message_id = EXCLUDED.provider_message_id,
    updated_at = now()
  WHERE (l.kind, l.notification_type, l.category, l.status, l.sent_at, l.segments, l.units,
         l.credit_charged, l.provider_message_id)
        IS DISTINCT FROM
        (EXCLUDED.kind, coalesce(EXCLUDED.notification_type, l.notification_type),
         public.sms_finance_category(
           'outbound', EXCLUDED.kind, coalesce(EXCLUDED.notification_type, l.notification_type)),
         EXCLUDED.status, EXCLUDED.sent_at, EXCLUDED.segments, EXCLUDED.units,
         EXCLUDED.credit_charged, EXCLUDED.provider_message_id);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- Sign-in codes: the text never leaves auth-send-sms and is not stored, so its
-- parts are those of domain.ts:buildAuthCode(<6 digits>, <host>) (the template
-- below is pinned to TEMPLATES.auth_code by check-contracts C50). The host is
-- the WebOTP line's, auth-send-sms's SITE_URL; the database reads the same
-- origin from Vault 'app.site_url' (C18), else the canonical host. On the
-- canonical host the text is one part, on staging's two. A row keeps the part
-- count of its first sync (the 7-day source rows are synced within the hour).
CREATE OR REPLACE FUNCTION public._sms_finance_sync_auth_codes()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_host text;
  v_segments integer;
  v_count integer;
BEGIN
  BEGIN
    SELECT substring(rtrim(btrim(decrypted_secret), '/') FROM '^https://([a-z0-9.-]+)$') INTO v_host
      FROM vault.decrypted_secrets WHERE name = 'app.site_url';
  EXCEPTION WHEN OTHERS THEN
    v_host := NULL;
  END;
  v_segments := public.sms_billing_units(
    'MyBakuriani კოდი: 000000. არავის გაუზიაროთ.'
    || E'\n@' || coalesce(v_host, 'mybakuriani.ge') || ' #000000');

  INSERT INTO public.sms_usage_ledger AS l (
    source, source_id, kind, notification_type, category, status, sent_at,
    segments, units, credit_charged, provider_message_id
  )
  SELECT 'auth_code', a.id, a.kind, NULL, 'otp',
         CASE WHEN a.status = 'sent' THEN 'sent' ELSE 'failed' END,
         coalesce(a.settled_at, a.created_at),
         v_segments,
         CASE WHEN a.status = 'sent' THEN v_segments ELSE 0 END,
         false,
         a.provider_message_id
  FROM public.auth_sms_code_log a
  WHERE a.status IN ('sent', 'failed')
  ON CONFLICT (source, source_id) DO UPDATE SET
    status = EXCLUDED.status,
    sent_at = EXCLUDED.sent_at,
    units = CASE WHEN EXCLUDED.units > 0 THEN l.segments ELSE 0 END,
    provider_message_id = EXCLUDED.provider_message_id,
    updated_at = now()
  WHERE (l.status, l.sent_at, l.units, l.provider_message_id)
        IS DISTINCT FROM (EXCLUDED.status, EXCLUDED.sent_at,
                          CASE WHEN EXCLUDED.units > 0 THEN l.segments ELSE 0 END,
                          EXCLUDED.provider_message_id);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.sms_finance_sync()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('sms-finance-sync', 0));
  RETURN public._sms_finance_sync_outbound(NULL) + public._sms_finance_sync_auth_codes();
END;
$$;

-- An account deletion cascades into sms_outbound: record the row before it goes.
-- Never blocks the delete.
CREATE OR REPLACE FUNCTION public.sms_outbound_keep_ledger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF OLD.provider_message_id IS NOT NULL
     OR (OLD.status = 'failed' AND OLD.dispatch_attempt_count > 0) THEN
    BEGIN
      PERFORM public._sms_finance_sync_outbound(OLD.id);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'sms_usage_ledger: could not keep sms_outbound %: %', OLD.id, SQLERRM;
    END;
  END IF;
  RETURN OLD;
END;
$$;

CREATE TRIGGER sms_outbound_keep_ledger
  BEFORE DELETE ON public.sms_outbound
  FOR EACH ROW EXECUTE FUNCTION public.sms_outbound_keep_ledger();

-- ---------------------------------------------------------------------------
-- A package counts until it is voided here or its expense is reversed in Finances.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sms_finance_active_purchases()
RETURNS TABLE (
  id uuid, purchase_no bigint, purchased_on date, units integer, amount_gel numeric,
  unit_cost numeric, lot_start bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT p.id, p.purchase_no, p.purchased_on, p.units, p.amount_gel, p.unit_cost,
         sum(p.units) OVER (ORDER BY p.purchased_on, p.purchase_no ROWS UNBOUNDED PRECEDING) - p.units
  FROM public.sms_provider_purchases p
  WHERE p.voided_at IS NULL
    AND NOT EXISTS (SELECT 1 FROM public.finance_expenses r WHERE r.reverses_id = p.expense_id)
$$;

-- ---------------------------------------------------------------------------
-- Every ledger row with its FIFO cost, the units no package covers, and its
-- revenue: the average sale price of one credit over the SMS package sales up to
-- that send (the enabled price list before any sale), for rows that took a credit.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sms_finance_costed()
RETURNS TABLE (ledger_id uuid, cost numeric, unpriced_units integer, revenue numeric)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH lots AS (
    SELECT units, unit_cost, lot_start FROM public.sms_finance_active_purchases()
  ),
  used AS (
    SELECT l.id, l.units, l.sent_at, l.credit_charged,
           sum(l.units) OVER (ORDER BY l.sent_at, l.id ROWS UNBOUNDED PRECEDING) - l.units AS use_start
    FROM public.sms_usage_ledger l
  ),
  -- least()/greatest() skip NULLs, so an unmatched row of the LEFT JOIN must be
  -- filtered out, or it would count as fully priced at no cost.
  priced AS (
    SELECT u.id,
           coalesce(sum((least(u.use_start + u.units, lo.lot_start + lo.units)
                         - greatest(u.use_start, lo.lot_start)) * lo.unit_cost)
                    FILTER (WHERE lo.lot_start IS NOT NULL), 0) AS cost,
           u.units - coalesce(sum(least(u.use_start + u.units, lo.lot_start + lo.units)
                                  - greatest(u.use_start, lo.lot_start))
                              FILTER (WHERE lo.lot_start IS NOT NULL), 0) AS unpriced
    FROM used u
    LEFT JOIN lots lo
      ON u.units > 0
     AND lo.lot_start < u.use_start + u.units
     AND lo.lot_start + lo.units > u.use_start
    GROUP BY u.id, u.units
  ),
  sales AS (
    SELECT t.created_at AS at, t.id::text AS tie, abs(t.amount)::numeric AS money,
           (substring(t.description FROM '\((\d+) ცალი\)\s*$'))::numeric
             * nullif((pk.meta ->> 'sms_count')::numeric, 0) AS credits
    FROM public.transactions t
    JOIN public.pricing_packages pk ON pk.id::text = t.reference_id::text AND pk.category = 'sms'
    WHERE t.type = 'sms_package' AND t.amount < 0
  ),
  sale_prices AS MATERIALIZED (
    SELECT s.at, sum(s.money) OVER w / sum(s.credits) OVER w AS price
    FROM sales s
    WHERE s.credits > 0
    WINDOW w AS (ORDER BY s.at, s.tie ROWS UNBOUNDED PRECEDING)
  ),
  list_price AS (
    SELECT min(pk.amount_gel / nullif((pk.meta ->> 'sms_count')::numeric, 0)) AS price
    FROM public.pricing_packages pk
    WHERE pk.category = 'sms' AND pk.is_enabled
  )
  SELECT u.id,
         round(p.cost, 6),
         p.unpriced::integer,
         CASE WHEN u.credit_charged
              THEN round(coalesce(cp.price, (SELECT price FROM list_price), 0), 6)
              ELSE 0 END
  FROM used u
  JOIN priced p ON p.id = u.id
  LEFT JOIN LATERAL (
    SELECT sp.price FROM sale_prices sp
    WHERE u.credit_charged AND sp.at <= u.sent_at
    ORDER BY sp.at DESC
    LIMIT 1
  ) cp ON true
$$;

-- ---------------------------------------------------------------------------
-- Balance (§7) and the low-balance warning. Armed only once a package exists:
-- before the first purchase is entered every balance is "negative".
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sms_finance_check_balance()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_packages integer;
  v_purchased bigint;
  v_used bigint;
  v_remaining bigint;
  v_settings public.finance_settings%ROWTYPE;
  v_notified integer := 0;
BEGIN
  SELECT count(*), coalesce(sum(units), 0) INTO v_packages, v_purchased
  FROM public.sms_finance_active_purchases();
  SELECT coalesce(sum(units), 0) INTO v_used FROM public.sms_usage_ledger;
  v_remaining := v_purchased - v_used;
  SELECT * INTO v_settings FROM public.finance_settings WHERE id FOR UPDATE;

  IF v_packages > 0 AND v_remaining <= v_settings.sms_low_balance_units THEN
    IF v_settings.sms_low_balance_notified_at IS NULL THEN
      v_notified := public._notify_admins(
        'admin_sms_balance_low',
        'SMS ბალანსი იწურება',
        format('დარჩა %s SMS (ზღვარი: %s). შეიძინეთ uBill-ის პაკეტი და დაამატეთ SMS კონტროლში.',
               v_remaining, v_settings.sms_low_balance_units),
        '/dashboard/admin/finances/sms'
      );
      UPDATE public.finance_settings SET sms_low_balance_notified_at = now() WHERE id;
    END IF;
  ELSIF v_settings.sms_low_balance_notified_at IS NOT NULL THEN
    UPDATE public.finance_settings SET sms_low_balance_notified_at = NULL WHERE id;
  END IF;

  RETURN jsonb_build_object(
    'packages', v_packages,
    'remaining_units', v_remaining,
    'threshold', v_settings.sms_low_balance_units,
    'low', v_packages > 0 AND v_remaining <= v_settings.sms_low_balance_units,
    'notified', v_notified
  );
END;
$$;

-- pg_cron: sync, then the warning.
CREATE OR REPLACE FUNCTION public.sms_finance_hourly()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_synced integer;
BEGIN
  v_synced := public.sms_finance_sync();
  RETURN public.sms_finance_check_balance() || jsonb_build_object('synced', v_synced);
END;
$$;

-- The actor of every admin write must be an admin (the routes check it too).
CREATE OR REPLACE FUNCTION public._sms_finance_require_admin(p_actor uuid)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_actor IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = p_actor AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'admin actor required' USING ERRCODE = '42501';
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- Admin writes
-- ---------------------------------------------------------------------------
-- "SMS პაკეტის დამატება": the package and its Finances expense in one transaction.
CREATE OR REPLACE FUNCTION public.finance_record_sms_purchase(
  p_actor uuid,
  p_date date,
  p_units integer,
  p_amount numeric,
  p_invoice_ref text DEFAULT NULL,
  p_comment text DEFAULT NULL,
  p_payment_method text DEFAULT 'bank_transfer'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_invoice text := nullif(btrim(coalesce(p_invoice_ref, '')), '');
  v_comment text := nullif(btrim(coalesce(p_comment, '')), '');
  v_expense public.finance_expenses%ROWTYPE;
  v_purchase public.sms_provider_purchases%ROWTYPE;
BEGIN
  PERFORM public._sms_finance_require_admin(p_actor);
  IF p_date IS NULL OR p_date > (now() AT TIME ZONE 'Asia/Tbilisi')::date THEN
    RAISE EXCEPTION 'purchase date must not be in the future' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.finance_expenses (
    expense_date, supplier_name, category, document_number, amount, vat_amount,
    payment_method, note, created_by
  ) VALUES (
    p_date, 'uBill', 'communications', v_invoice, round(p_amount, 2), 0,
    p_payment_method, concat_ws(' · ', format('SMS პაკეტი: %s SMS', p_units), v_comment), p_actor
  )
  RETURNING * INTO v_expense;

  INSERT INTO public.sms_provider_purchases (
    purchased_on, units, amount_gel, invoice_ref, comment, expense_id, created_by
  ) VALUES (
    p_date, p_units, round(p_amount, 2), v_invoice, v_comment, v_expense.id, p_actor
  )
  RETURNING * INTO v_purchase;

  PERFORM public.sms_finance_check_balance();
  RETURN jsonb_build_object(
    'id', v_purchase.id,
    'purchase_no', v_purchase.purchase_no,
    'expense_no', v_expense.expense_no
  );
END;
$$;

-- Void = reverse its expense (C42: never deleted). An expense already reversed in
-- Finances is linked instead of reversed twice.
CREATE OR REPLACE FUNCTION public.finance_void_sms_purchase(p_actor uuid, p_id uuid, p_reason text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_purchase public.sms_provider_purchases%ROWTYPE;
  v_expense public.finance_expenses%ROWTYPE;
  v_reversal uuid;
BEGIN
  PERFORM public._sms_finance_require_admin(p_actor);
  SELECT * INTO v_purchase FROM public.sms_provider_purchases WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'FINANCE_ENTRY_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  IF v_purchase.voided_at IS NOT NULL THEN
    RAISE EXCEPTION 'FINANCE_ALREADY_REVERSED' USING ERRCODE = '23505';
  END IF;
  IF v_reason IS NULL THEN
    RAISE EXCEPTION 'FINANCE_NOTE_REQUIRED' USING ERRCODE = '22023';
  END IF;

  SELECT r.id INTO v_reversal FROM public.finance_expenses r WHERE r.reverses_id = v_purchase.expense_id;
  IF v_reversal IS NULL THEN
    SELECT * INTO v_expense FROM public.finance_expenses WHERE id = v_purchase.expense_id;
    INSERT INTO public.finance_expenses (
      kind, reverses_id, expense_date, supplier_name, category, amount, payment_method, note, created_by
    ) VALUES (
      'reversal', v_expense.id, v_expense.expense_date, v_expense.supplier_name, v_expense.category,
      v_expense.amount, v_expense.payment_method, v_reason, p_actor
    )
    RETURNING id INTO v_reversal;
  END IF;

  UPDATE public.sms_provider_purchases
     SET voided_at = now(), voided_by = p_actor, void_reason = v_reason, void_expense_id = v_reversal
   WHERE id = p_id;

  PERFORM public.sms_finance_check_balance();
  RETURN jsonb_build_object('id', p_id, 'reversal_id', v_reversal);
END;
$$;

CREATE OR REPLACE FUNCTION public.finance_set_sms_low_balance(p_actor uuid, p_units integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM public._sms_finance_require_admin(p_actor);
  UPDATE public.finance_settings
     SET sms_low_balance_units = p_units,
         sms_low_balance_notified_at = NULL,
         updated_at = now(),
         updated_by = p_actor
   WHERE id;
  RETURN public.sms_finance_check_balance();
END;
$$;

-- ---------------------------------------------------------------------------
-- Admin reads: the single SQL definition of every number on the SMS page and in
-- its exports (C26). Days are Asia/Tbilisi; NULL bounds = all time.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._sms_finance_check_filters(
  p_from date, p_to date, p_category text, p_status text
)
RETURNS void
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
BEGIN
  IF p_category IS NOT NULL
     AND p_category NOT IN ('otp', 'smart_match', 'listing', 'marketing', 'admin', 'other') THEN
    RAISE EXCEPTION 'unknown SMS type %', p_category USING ERRCODE = '22023';
  END IF;
  IF p_status IS NOT NULL AND p_status NOT IN ('sent', 'delivered', 'failed') THEN
    RAISE EXCEPTION 'unknown SMS status %', p_status USING ERRCODE = '22023';
  END IF;
  IF p_from IS NOT NULL AND p_to IS NOT NULL AND p_from > p_to THEN
    RAISE EXCEPTION 'from after to' USING ERRCODE = '22023';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_sms_finance_summary(
  p_from date DEFAULT NULL,
  p_to date DEFAULT NULL,
  p_category text DEFAULT NULL,
  p_status text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_from timestamptz := CASE WHEN p_from IS NULL THEN NULL ELSE p_from::timestamp AT TIME ZONE 'Asia/Tbilisi' END;
  v_to timestamptz := CASE WHEN p_to IS NULL THEN NULL ELSE (p_to + 1)::timestamp AT TIME ZONE 'Asia/Tbilisi' END;
  v_today date := (now() AT TIME ZONE 'Asia/Tbilisi')::date;
  v_result jsonb;
BEGIN
  PERFORM public._sms_finance_check_filters(p_from, p_to, p_category, p_status);
  PERFORM public.sms_finance_sync();

  WITH costed AS (
    SELECT l.*, c.cost, c.unpriced_units, c.revenue
    FROM public.sms_usage_ledger l
    JOIN public.sms_finance_costed() c ON c.ledger_id = l.id
  ),
  picked AS (
    SELECT * FROM costed
    WHERE (v_from IS NULL OR sent_at >= v_from)
      AND (v_to IS NULL OR sent_at < v_to)
      AND (p_category IS NULL OR category = p_category)
      AND (p_status IS NULL OR status = p_status)
  ),
  lots AS (SELECT * FROM public.sms_finance_active_purchases()),
  period_lots AS (
    SELECT * FROM lots
    WHERE (p_from IS NULL OR purchased_on >= p_from) AND (p_to IS NULL OR purchased_on <= p_to)
  ),
  sales AS (
    SELECT abs(t.amount)::numeric AS money,
           (substring(t.description FROM '\((\d+) ცალი\)\s*$'))::numeric
             * nullif((pk.meta ->> 'sms_count')::numeric, 0) AS credits
    FROM public.transactions t
    LEFT JOIN public.pricing_packages pk ON pk.id::text = t.reference_id::text AND pk.category = 'sms'
    WHERE t.type = 'sms_package' AND t.amount < 0
      AND (v_from IS NULL OR t.created_at >= v_from)
      AND (v_to IS NULL OR t.created_at < v_to)
  ),
  totals AS (
    SELECT coalesce(sum(units), 0) AS purchased_all,
           coalesce(sum(amount_gel), 0) AS paid_all
    FROM lots
  ),
  usage_all AS (
    SELECT coalesce(sum(units), 0) AS used_all,
           coalesce(sum(unpriced_units), 0) AS unpriced_all,
           coalesce(sum(units) FILTER (WHERE sent_at >= now() - interval '30 days'), 0) AS used_30d
    FROM costed
  ),
  remaining_lots AS (
    SELECT coalesce(sum(greatest(0, least(lo.units, lo.lot_start + lo.units - u.used_all)) * lo.unit_cost), 0) AS value
    FROM lots lo CROSS JOIN usage_all u
  ),
  types AS (
    SELECT t.category, t.ord,
           count(p.id) AS messages,
           coalesce(sum(p.units), 0) AS units,
           count(p.id) FILTER (WHERE p.status = 'sent') AS sent,
           count(p.id) FILTER (WHERE p.status = 'delivered') AS delivered,
           count(p.id) FILTER (WHERE p.status = 'failed') AS failed,
           coalesce(sum(p.cost), 0) AS cost,
           coalesce(sum(p.revenue), 0) AS revenue
    FROM unnest(ARRAY['otp', 'smart_match', 'listing', 'marketing', 'admin', 'other'])
           WITH ORDINALITY AS t(category, ord)
    LEFT JOIN picked p ON p.category = t.category
    GROUP BY t.category, t.ord
  ),
  kinds AS (
    SELECT p.category,
           CASE WHEN p.kind = 'notification' AND p.notification_type IS NOT NULL
                THEN 'notification:' || p.notification_type ELSE p.kind END AS kind,
           count(*) AS messages,
           sum(p.units) AS units,
           count(*) FILTER (WHERE p.status = 'sent') AS sent,
           count(*) FILTER (WHERE p.status = 'delivered') AS delivered,
           count(*) FILTER (WHERE p.status = 'failed') AS failed,
           sum(p.cost) AS cost,
           sum(p.revenue) AS revenue
    FROM picked p
    GROUP BY 1, 2
  )
  SELECT jsonb_build_object(
    'range', jsonb_build_object('from', p_from, 'to', p_to),
    'kpis', (
      SELECT jsonb_build_object(
        'purchased_units', (SELECT coalesce(sum(units), 0) FROM period_lots),
        'purchase_cost', (SELECT coalesce(sum(amount_gel), 0) FROM period_lots),
        'packages', (SELECT count(*) FROM period_lots),
        'messages', count(*),
        'used_units', coalesce(sum(units), 0),
        'used_cost', round(coalesce(sum(cost), 0), 2),
        'revenue', round(coalesce(sum(revenue), 0), 2),
        'profit', round(coalesce(sum(revenue), 0) - coalesce(sum(cost), 0), 2),
        'charged_messages', count(*) FILTER (WHERE credit_charged),
        'unpriced_units', coalesce(sum(unpriced_units), 0),
        'cash_sales', (SELECT round(coalesce(sum(money), 0), 2) FROM sales),
        'cash_credits', (SELECT coalesce(sum(credits), 0) FROM sales)
      )
      FROM picked
    ),
    'types', (
      SELECT jsonb_agg(jsonb_build_object(
        'category', t.category,
        'messages', t.messages,
        'units', t.units,
        'sent', t.sent,
        'delivered', t.delivered,
        'failed', t.failed,
        'cost', round(t.cost, 2),
        'revenue', round(t.revenue, 2),
        'profit', round(t.revenue - t.cost, 2),
        'kinds', coalesce((
          SELECT jsonb_agg(jsonb_build_object(
            'kind', k.kind, 'messages', k.messages, 'units', k.units, 'sent', k.sent,
            'delivered', k.delivered, 'failed', k.failed, 'cost', round(k.cost, 2),
            'revenue', round(k.revenue, 2), 'profit', round(k.revenue - k.cost, 2)
          ) ORDER BY k.units DESC, k.kind)
          FROM kinds k WHERE k.category = t.category
        ), '[]'::jsonb)
      ) ORDER BY t.ord)
      FROM types t
    ),
    'balance', (
      SELECT jsonb_build_object(
        'packages', (SELECT count(*) FROM lots),
        'purchased_units', tt.purchased_all,
        'paid', tt.paid_all,
        'used_units', u.used_all,
        'remaining_units', tt.purchased_all - u.used_all,
        'avg_unit_cost', CASE WHEN tt.purchased_all > 0 THEN round(tt.paid_all / tt.purchased_all, 6) END,
        'remaining_value', round(r.value, 2),
        'unpriced_units', u.unpriced_all,
        'daily_units_30d', round(u.used_30d / 30.0, 2),
        'days_left', CASE
          WHEN tt.purchased_all - u.used_all <= 0 THEN 0
          WHEN u.used_30d > 0 THEN floor((tt.purchased_all - u.used_all) / (u.used_30d / 30.0))::integer
        END,
        'depletion_date', CASE
          WHEN tt.purchased_all - u.used_all <= 0 THEN v_today
          WHEN u.used_30d > 0 THEN v_today + floor((tt.purchased_all - u.used_all) / (u.used_30d / 30.0))::integer
        END,
        'threshold', fs.sms_low_balance_units,
        'low', (SELECT count(*) FROM lots) > 0 AND tt.purchased_all - u.used_all <= fs.sms_low_balance_units,
        'notified_at', fs.sms_low_balance_notified_at
      )
      FROM totals tt
      CROSS JOIN usage_all u
      CROSS JOIN remaining_lots r
      CROSS JOIN public.finance_settings fs
      WHERE fs.id
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$;

-- The ledger rows (newest first) with their cost and revenue; p_limit at most 20000.
CREATE OR REPLACE FUNCTION public.admin_sms_finance_ledger(
  p_from date DEFAULT NULL,
  p_to date DEFAULT NULL,
  p_category text DEFAULT NULL,
  p_status text DEFAULT NULL,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_from timestamptz := CASE WHEN p_from IS NULL THEN NULL ELSE p_from::timestamp AT TIME ZONE 'Asia/Tbilisi' END;
  v_to timestamptz := CASE WHEN p_to IS NULL THEN NULL ELSE (p_to + 1)::timestamp AT TIME ZONE 'Asia/Tbilisi' END;
  v_result jsonb;
BEGIN
  PERFORM public._sms_finance_check_filters(p_from, p_to, p_category, p_status);
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 20000 OR p_offset IS NULL OR p_offset < 0 THEN
    RAISE EXCEPTION 'invalid page' USING ERRCODE = '22023';
  END IF;
  PERFORM public.sms_finance_sync();

  WITH picked AS (
    SELECT l.*, c.cost, c.unpriced_units, c.revenue
    FROM public.sms_usage_ledger l
    JOIN public.sms_finance_costed() c ON c.ledger_id = l.id
    WHERE (v_from IS NULL OR l.sent_at >= v_from)
      AND (v_to IS NULL OR l.sent_at < v_to)
      AND (p_category IS NULL OR l.category = p_category)
      AND (p_status IS NULL OR l.status = p_status)
  ),
  page AS (
    SELECT * FROM picked ORDER BY sent_at DESC, id DESC LIMIT p_limit OFFSET p_offset
  )
  SELECT jsonb_build_object(
    'count', (SELECT count(*) FROM picked),
    'rows', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', id, 'sent_at', sent_at, 'source', source, 'kind', kind,
        'notification_type', notification_type, 'category', category, 'status', status,
        'segments', segments, 'units', units, 'credit_charged', credit_charged,
        'provider_message_id', provider_message_id, 'cost', round(cost, 4),
        'revenue', round(revenue, 4), 'unpriced_units', unpriced_units
      ) ORDER BY sent_at DESC, id DESC)
      FROM page
    ), '[]'::jsonb)
  ) INTO v_result;
  RETURN v_result;
END;
$$;

-- Every package (voided ones too) with how much of it FIFO has used up.
CREATE OR REPLACE FUNCTION public.admin_sms_finance_purchases()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_used bigint;
  v_result jsonb;
BEGIN
  PERFORM public.sms_finance_sync();
  SELECT coalesce(sum(units), 0) INTO v_used FROM public.sms_usage_ledger;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', p.id,
    'purchase_no', p.purchase_no,
    'purchased_on', p.purchased_on,
    'units', p.units,
    'amount_gel', p.amount_gel,
    'unit_cost', p.unit_cost,
    'invoice_ref', p.invoice_ref,
    'comment', p.comment,
    'created_at', p.created_at,
    'created_by_name', cb.display_name,
    'expense_no', e.expense_no,
    'active', a.id IS NOT NULL,
    'voided_at', coalesce(p.voided_at, rv.created_at),
    'void_reason', coalesce(p.void_reason, rv.note),
    'used_units', CASE WHEN a.id IS NULL THEN 0
                       ELSE greatest(0, least(p.units, v_used - a.lot_start)) END,
    'remaining_units', CASE WHEN a.id IS NULL THEN 0
                            ELSE greatest(0, least(p.units, a.lot_start + p.units - v_used)) END
  ) ORDER BY p.purchased_on DESC, p.purchase_no DESC), '[]'::jsonb)
  INTO v_result
  FROM public.sms_provider_purchases p
  JOIN public.finance_expenses e ON e.id = p.expense_id
  LEFT JOIN public.finance_expenses rv ON rv.reverses_id = p.expense_id
  LEFT JOIN public.profiles cb ON cb.id = p.created_by
  LEFT JOIN public.sms_finance_active_purchases() a ON a.id = p.id;

  RETURN v_result;
END;
$$;

-- ---------------------------------------------------------------------------
-- Grants: service role only (C34).
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'public.sms_provider_purchases_guard()',
    'public.sms_billing_units(text)',
    'public.sms_finance_category(text, text, text)',
    'public.sms_finance_outbound_status(text, timestamptz)',
    'public._sms_finance_sync_outbound(uuid)',
    'public._sms_finance_sync_auth_codes()',
    'public.sms_finance_sync()',
    'public.sms_outbound_keep_ledger()',
    'public.sms_finance_active_purchases()',
    'public.sms_finance_costed()',
    'public.sms_finance_check_balance()',
    'public.sms_finance_hourly()',
    'public._sms_finance_require_admin(uuid)',
    'public.finance_record_sms_purchase(uuid, date, integer, numeric, text, text, text)',
    'public.finance_void_sms_purchase(uuid, uuid, text)',
    'public.finance_set_sms_low_balance(uuid, integer)',
    'public._sms_finance_check_filters(date, date, text, text)',
    'public.admin_sms_finance_summary(date, date, text, text)',
    'public.admin_sms_finance_ledger(date, date, text, text, integer, integer)',
    'public.admin_sms_finance_purchases()'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', f);
  END LOOP;
END
$$;

-- ---------------------------------------------------------------------------
-- Backfill what the sources still hold, then the hourly job (SQL only, C4).
-- ---------------------------------------------------------------------------
SELECT public.sms_finance_sync();

DO $$
BEGIN
  PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'sms-finance-hourly';
  PERFORM cron.schedule('sms-finance-hourly', '23 * * * *', $cron$SELECT public.sms_finance_hourly()$cron$);
END
$$;
