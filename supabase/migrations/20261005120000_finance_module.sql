-- 20261005120000_finance_module.sql
--
-- Finance & tax reporting module (contract C42), admin only.
-- Spec: MyBakuriani_Finansuri_Sagadasaxado_Angarisgebis_Moduli_v2.docx.
--
-- Money that reaches MyBakuriani today is Keepz card money (C32): a payment
-- tops up the payer's wallet 1:1 and the wallet later buys VIP, packages and
-- subscriptions. The tax base here is CASH (Tax Code arts. 136-138: an
-- individual entrepreneur may book income when the money arrives):
--   * a Keepz payment counts once it is succeeded AND credited, dated by
--     completed_at, in Asia/Tbilisi months;
--   * a Keepz refund counts in the month it succeeded (resolved_at);
--   * money taken outside Keepz (bank transfer, cash, another provider) is
--     recorded by an admin in finance_entries.
-- Wallet spending (transactions) is never added to cash: it is the same money
-- a second time. finance_wallet_usage() reports it separately, by type.
--
-- Records are append-only. No finance row is ever deleted (BEFORE DELETE
-- raises, for the service role too); a mistake is corrected by a reversal row
-- that mirrors its original in the original's period, or by an adjustment.
-- Every table carries trg_audit_row (writes go through
-- createServiceClient(adminId), so audit_logs names the acting admin).
--
-- Every number the admin sees comes from one SQL definition here:
--   finance_ledger_v          effective money movements (the only source)
--   finance_monthly_totals()  per-month received / refunds / net / taxable
--   finance_tax_year()        + small-business rate (art. 90) and estimate
--   finance_vat_window()      trailing 12 calendar months (art. 165)
--   finance_owner_payables()  third-party money still owed
--   finance_wallet_usage()    wallet spending by revenue type (management)
--   finance_invoice_totals()  what an invoice has been paid / refunded
-- platform_revenue() (C26) is left as it is.
--
-- Nothing here is readable by anon or authenticated: RLS is on with no
-- policies, every client grant is revoked, and the functions are service_role
-- only. The admin API routes use the service role behind requireAdmin().

-- ===========================================================================
-- Settings (one row)
-- ===========================================================================

CREATE TABLE public.finance_settings (
  id boolean PRIMARY KEY DEFAULT true,
  -- Issuer details printed on invoices. Empty until an admin fills them in;
  -- an invoice cannot be issued without legal_name and tax_id.
  legal_name text,
  tax_id text,
  legal_address text,
  email text,
  phone text,
  bank_name text,
  bank_iban text,
  bank_swift text,
  -- Tax Code art. 90: 1 %, and 3 % from the start of the month in which the
  -- calendar year's income passes 500 000 GEL.
  small_business_rate numeric(5,2) NOT NULL DEFAULT 1,
  small_business_high_rate numeric(5,2) NOT NULL DEFAULT 3,
  small_business_threshold numeric(14,2) NOT NULL DEFAULT 500000,
  threshold_warning_percent numeric(5,2) NOT NULL DEFAULT 80,
  -- Tax Code art. 165: registration within 2 working days once any 12
  -- consecutive calendar months pass 100 000 GEL.
  vat_registered boolean NOT NULL DEFAULT false,
  vat_rate numeric(5,2) NOT NULL DEFAULT 18,
  vat_threshold numeric(14,2) NOT NULL DEFAULT 100000,
  invoice_prefix text NOT NULL DEFAULT 'MB',
  invoice_due_days integer NOT NULL DEFAULT 14,
  invoice_terms text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  CONSTRAINT finance_settings_singleton CHECK (id),
  CONSTRAINT finance_settings_rates_check CHECK (
    small_business_rate BETWEEN 0 AND 100
    AND small_business_high_rate BETWEEN 0 AND 100
    AND vat_rate BETWEEN 0 AND 100
  ),
  CONSTRAINT finance_settings_thresholds_check CHECK (
    small_business_threshold > 0
    AND vat_threshold > 0
    AND threshold_warning_percent > 0
    AND threshold_warning_percent < 100
  ),
  CONSTRAINT finance_settings_invoice_check CHECK (
    invoice_prefix ~ '^[A-Z0-9]{1,8}$'
    AND invoice_due_days BETWEEN 0 AND 365
  ),
  CONSTRAINT finance_settings_text_check CHECK (
    char_length(coalesce(legal_name, '')) <= 200
    AND char_length(coalesce(tax_id, '')) <= 50
    AND char_length(coalesce(legal_address, '')) <= 300
    AND char_length(coalesce(email, '')) <= 200
    AND char_length(coalesce(phone, '')) <= 50
    AND char_length(coalesce(bank_name, '')) <= 200
    AND char_length(coalesce(bank_iban, '')) <= 50
    AND char_length(coalesce(bank_swift, '')) <= 20
    AND char_length(coalesce(invoice_terms, '')) <= 2000
  )
);

INSERT INTO public.finance_settings (id) VALUES (true) ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.finance_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.finance_settings FROM PUBLIC, anon, authenticated;
GRANT SELECT, UPDATE ON public.finance_settings TO service_role;

CREATE TRIGGER trg_audit_row
  AFTER INSERT OR DELETE OR UPDATE ON public.finance_settings
  FOR EACH ROW EXECUTE FUNCTION public.audit_row_change();

-- ===========================================================================
-- Shared guards
-- ===========================================================================

-- Finance rows are never deleted, by anyone (triggers fire for service_role).
CREATE OR REPLACE FUNCTION public.finance_forbid_delete()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'FINANCE_RECORD_IMMUTABLE'
    USING ERRCODE = '55000',
          HINT = 'Finance records are never deleted; record a reversal instead.';
END;
$$;

-- A text that is a UUID, or NULL (payments.resume carries client JSON).
CREATE OR REPLACE FUNCTION public.finance_try_uuid(p_value text)
RETURNS uuid
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE
    WHEN p_value ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      THEN p_value::uuid
  END
$$;

-- ===========================================================================
-- Revenue types (spec §3) — one classification, used by every report
-- ===========================================================================
--   listing_placement     განცხადების განთავსება (renter/seller memberships)
--   premium_featured      Premium/Featured (VIP, SUPER VIP, discount badges)
--   advertising           რეკლამა
--   commission            საკომისიო (marketplace commission; none online yet)
--   subscription_package  გამოწერა/პაკეტი (SMS packages)
--   vip_business          VIP/Business პაკეტი (company subscriptions)
--   other_service         სხვა მომსახურება
--   wallet_topup          ბალანსის შევსება: a card payment not tied to one
--                         purchase (an advance for any platform service)
--   other_income          სხვა შემოსავალი: own income that is not a service

CREATE OR REPLACE FUNCTION public.finance_package_revenue_type(p_category text, p_code text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE
    WHEN p_category = 'vip' THEN 'premium_featured'
    WHEN p_category = 'sms' THEN 'subscription_package'
    WHEN p_category = 'subscription' AND p_code LIKE 'company-%' THEN 'vip_business'
    WHEN p_category = 'subscription' THEN 'listing_placement'
    WHEN p_category = 'ad' THEN 'advertising'
    ELSE 'other_service'
  END
$$;

-- A Keepz payment's type: what its "pay by card" intent bought (C32
-- payments.resume), else a plain wallet top-up.
CREATE OR REPLACE FUNCTION public.finance_intent_revenue_type(p_resume jsonb)
RETURNS text
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT CASE
    WHEN p_resume IS NULL OR jsonb_typeof(p_resume) <> 'object' THEN 'wallet_topup'
    WHEN p_resume ->> 'kind' = 'company-subscription' THEN 'vip_business'
    WHEN p_resume ->> 'kind' = 'menu-item-discount' THEN 'premium_featured'
    WHEN p_resume ->> 'kind' = 'purchase-vip' THEN coalesce((
      SELECT public.finance_package_revenue_type(pp.category, pp.code)
      FROM public.pricing_packages pp
      WHERE pp.id = public.finance_try_uuid(p_resume -> 'body' ->> 'package_id')
    ), 'other_service')
    ELSE 'wallet_topup'
  END
$$;

-- A wallet transaction's type, by what its reference points at. NULL for
-- rows that are not a purchase (top-ups, card refunds, SMS sends).
CREATE OR REPLACE FUNCTION public.finance_transaction_revenue_type(
  p_type public.transaction_type,
  p_reference_id uuid
)
RETURNS text
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT CASE
    WHEN p_type IN ('vip_boost', 'super_vip', 'discount_badge') THEN 'premium_featured'
    WHEN p_type = 'sms_package' THEN 'subscription_package'
    WHEN p_type IN ('commission', 'membership_refund') THEN coalesce(
      (SELECT 'vip_business' FROM public.organizations o WHERE o.id = p_reference_id),
      (SELECT public.finance_package_revenue_type(pp.category, pp.code)
       FROM public.pricing_packages pp WHERE pp.id = p_reference_id),
      (SELECT public.finance_package_revenue_type(pp.category, pp.code)
       FROM public.user_subscriptions us
       JOIN public.pricing_packages pp ON pp.id = us.package_id
       WHERE us.id = p_reference_id),
      CASE WHEN p_type = 'membership_refund' THEN 'listing_placement' ELSE 'other_service' END
    )
  END
$$;

-- ===========================================================================
-- Invoices (spec §15-20). Declared first: an income can settle an invoice.
-- An invoice is never revenue; only the money that pays it is.
-- ===========================================================================

CREATE TABLE public.invoice_counters (
  year integer PRIMARY KEY,
  last_number integer NOT NULL DEFAULT 0,
  CONSTRAINT invoice_counters_year_check CHECK (year BETWEEN 2020 AND 2100),
  CONSTRAINT invoice_counters_last_number_check CHECK (last_number >= 0)
);

ALTER TABLE public.invoice_counters ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.invoice_counters FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.invoice_counters TO service_role;

CREATE TABLE public.invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Assigned by finance_issue_invoice(), never at draft time: a per-year
  -- counter row locked FOR UPDATE, so committed numbers have no gaps.
  invoice_number text,
  number_year integer,
  number_seq integer,
  status text NOT NULL DEFAULT 'draft',
  issue_date date,
  due_date date,
  -- Snapshot of finance_settings at issue: later edits never change an
  -- issued invoice.
  issuer jsonb,
  recipient_type text NOT NULL DEFAULT 'company',
  recipient_name text NOT NULL,
  recipient_tax_id text,
  recipient_address text,
  recipient_email text,
  recipient_phone text,
  recipient_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  -- [{description, quantity, unit_price, amount}], priced by invoices_guard().
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  subtotal numeric(12,2) NOT NULL DEFAULT 0,
  discount_amount numeric(12,2) NOT NULL DEFAULT 0,
  -- NULL = no VAT line (only when the tax regime calls for one).
  vat_rate numeric(5,2),
  vat_amount numeric(12,2) NOT NULL DEFAULT 0,
  total numeric(12,2) NOT NULL DEFAULT 0,
  payment_method text,
  -- A Keepz payment that paid this invoice (at most one invoice per payment).
  payment_id uuid REFERENCES public.payments(id),
  -- Order / booking id the invoice is for (free text).
  related_reference text,
  notes text,
  terms text,
  -- Secure link: only the SHA-256 of the token is stored.
  share_token_hash text,
  share_expires_at timestamptz,
  sent_at timestamptz,
  sent_count integer NOT NULL DEFAULT 0,
  last_sent_to text,
  issued_at timestamptz,
  cancelled_at timestamptz,
  cancel_reason text,
  duplicated_from uuid REFERENCES public.invoices(id),
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT invoices_status_check
    CHECK (status IN ('draft', 'issued', 'sent', 'cancelled')),
  CONSTRAINT invoices_recipient_type_check
    CHECK (recipient_type IN ('individual', 'company')),
  CONSTRAINT invoices_payment_method_check
    CHECK (payment_method IS NULL OR payment_method IN ('card', 'bank_transfer', 'cash', 'payment_provider')),
  CONSTRAINT invoices_number_check CHECK (
    (invoice_number IS NULL) = (number_seq IS NULL)
    AND (number_seq IS NULL) = (number_year IS NULL)
    AND (status NOT IN ('issued', 'sent') OR invoice_number IS NOT NULL)
  ),
  CONSTRAINT invoices_number_key UNIQUE (invoice_number),
  CONSTRAINT invoices_number_year_seq_key UNIQUE (number_year, number_seq),
  CONSTRAINT invoices_payment_id_key UNIQUE (payment_id),
  CONSTRAINT invoices_share_token_hash_key UNIQUE (share_token_hash),
  CONSTRAINT invoices_amounts_check CHECK (
    subtotal >= 0 AND discount_amount >= 0 AND discount_amount <= subtotal
    AND vat_amount >= 0 AND total >= 0 AND total <= 100000000
  ),
  CONSTRAINT invoices_vat_rate_check CHECK (vat_rate IS NULL OR (vat_rate > 0 AND vat_rate <= 100)),
  CONSTRAINT invoices_items_check CHECK (jsonb_typeof(items) = 'array'),
  CONSTRAINT invoices_due_date_check CHECK (due_date IS NULL OR issue_date IS NULL OR due_date >= issue_date),
  CONSTRAINT invoices_sent_count_check CHECK (sent_count >= 0),
  CONSTRAINT invoices_share_check CHECK (
    (share_token_hash IS NULL) = (share_expires_at IS NULL)
    AND (share_token_hash IS NULL OR share_token_hash ~ '^[0-9a-f]{64}$')
  ),
  CONSTRAINT invoices_text_check CHECK (
    char_length(btrim(recipient_name)) BETWEEN 1 AND 200
    AND char_length(coalesce(recipient_tax_id, '')) <= 50
    AND char_length(coalesce(recipient_address, '')) <= 300
    AND char_length(coalesce(recipient_email, '')) <= 200
    AND char_length(coalesce(recipient_phone, '')) <= 50
    AND char_length(coalesce(related_reference, '')) <= 100
    AND char_length(coalesce(notes, '')) <= 2000
    AND char_length(coalesce(terms, '')) <= 2000
    AND char_length(coalesce(cancel_reason, '')) <= 500
    AND char_length(coalesce(last_sent_to, '')) <= 320
  ),
  CONSTRAINT invoices_recipient_email_check CHECK (
    recipient_email IS NULL OR recipient_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'
  )
);

CREATE INDEX invoices_status_idx ON public.invoices (status, issue_date DESC);
CREATE INDEX invoices_created_idx ON public.invoices (created_at DESC);
CREATE INDEX invoices_recipient_profile_idx ON public.invoices (recipient_profile_id);

ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.invoices FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.invoices TO service_role;

CREATE TABLE public.invoice_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  -- Default invoice fields; validated by the API, priced by the invoice that
  -- is created from it.
  payload jsonb NOT NULL,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT invoice_templates_name_check CHECK (char_length(btrim(name)) BETWEEN 1 AND 120),
  CONSTRAINT invoice_templates_payload_check CHECK (jsonb_typeof(payload) = 'object')
);

ALTER TABLE public.invoice_templates ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.invoice_templates FROM PUBLIC, anon, authenticated;
-- Templates are presets, not financial records: they may be deleted.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoice_templates TO service_role;

-- ===========================================================================
-- Ledger entries recorded by an admin (spec §2, §4-6, §14)
-- ===========================================================================
--   income        money received outside Keepz (bank transfer, cash, …);
--                 owner_amount is the share that belongs to a third party
--   refund        money returned on an income entry (Keepz refunds go
--                 through the payments page, which also debits the wallet)
--   adjustment    signed correction of own revenue, note required
--   owner_payout  third-party money paid on to its owner
--   reversal      mirrors one entry (same fields, same period) and cancels it

CREATE TABLE public.finance_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_no bigint GENERATED ALWAYS AS IDENTITY,
  kind text NOT NULL,
  status text NOT NULL DEFAULT 'completed',
  occurred_at timestamptz NOT NULL,
  amount numeric(12,2) NOT NULL,
  owner_amount numeric(12,2) NOT NULL DEFAULT 0,
  revenue_type text,
  payment_method text,
  provider_name text,
  -- Name snapshots keep a record readable after the account is deleted.
  payer_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  payer_name text,
  payer_tax_id text,
  owner_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  owner_name text,
  property_id uuid REFERENCES public.properties(id) ON DELETE SET NULL,
  service_id uuid REFERENCES public.services(id) ON DELETE SET NULL,
  invoice_id uuid REFERENCES public.invoices(id),
  original_entry_id uuid REFERENCES public.finance_entries(id),
  reverses_id uuid REFERENCES public.finance_entries(id),
  reference text,
  note text,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT finance_entries_entry_no_key UNIQUE (entry_no),
  CONSTRAINT finance_entries_reverses_id_key UNIQUE (reverses_id),
  CONSTRAINT finance_entries_kind_check
    CHECK (kind IN ('income', 'refund', 'adjustment', 'owner_payout', 'reversal')),
  CONSTRAINT finance_entries_status_check
    CHECK (status IN ('pending', 'completed', 'failed', 'cancelled')),
  CONSTRAINT finance_entries_status_kind_check
    CHECK (kind = 'income' OR status = 'completed'),
  CONSTRAINT finance_entries_amount_check CHECK (
    (kind IN ('adjustment', 'reversal') AND amount <> 0)
    OR (kind NOT IN ('adjustment', 'reversal') AND amount > 0)
  ),
  CONSTRAINT finance_entries_amount_max_check CHECK (abs(amount) <= 10000000),
  CONSTRAINT finance_entries_owner_amount_check CHECK (
    owner_amount >= 0 AND owner_amount <= abs(amount)
    AND (kind <> 'adjustment' OR owner_amount = 0)
    AND (kind <> 'owner_payout' OR owner_amount = amount)
  ),
  CONSTRAINT finance_entries_revenue_type_check CHECK (
    revenue_type IS NULL OR revenue_type IN (
      'listing_placement', 'premium_featured', 'advertising', 'commission',
      'subscription_package', 'vip_business', 'other_service', 'wallet_topup',
      'other_income'
    )
  ),
  CONSTRAINT finance_entries_revenue_type_required_check
    CHECK (kind NOT IN ('income', 'adjustment') OR revenue_type IS NOT NULL),
  CONSTRAINT finance_entries_payment_method_check CHECK (
    payment_method IS NULL
    OR payment_method IN ('card', 'bank_transfer', 'cash', 'payment_provider')
  ),
  CONSTRAINT finance_entries_payment_method_required_check
    CHECK (kind NOT IN ('income', 'refund', 'owner_payout') OR payment_method IS NOT NULL),
  CONSTRAINT finance_entries_listing_check CHECK (property_id IS NULL OR service_id IS NULL),
  CONSTRAINT finance_entries_refund_link_check
    CHECK ((kind = 'refund') = (original_entry_id IS NOT NULL)),
  CONSTRAINT finance_entries_reversal_link_check
    CHECK ((kind = 'reversal') = (reverses_id IS NOT NULL)),
  CONSTRAINT finance_entries_invoice_check
    CHECK (invoice_id IS NULL OR kind = 'income'),
  CONSTRAINT finance_entries_text_check CHECK (
    char_length(coalesce(provider_name, '')) <= 100
    AND char_length(coalesce(payer_name, '')) <= 200
    AND char_length(coalesce(payer_tax_id, '')) <= 50
    AND char_length(coalesce(owner_name, '')) <= 200
    AND char_length(coalesce(reference, '')) <= 200
    AND char_length(coalesce(note, '')) <= 1000
  )
);

CREATE INDEX finance_entries_occurred_idx ON public.finance_entries (occurred_at DESC);
CREATE INDEX finance_entries_kind_idx ON public.finance_entries (kind, occurred_at DESC);
CREATE INDEX finance_entries_original_idx ON public.finance_entries (original_entry_id) WHERE original_entry_id IS NOT NULL;
CREATE INDEX finance_entries_invoice_idx ON public.finance_entries (invoice_id) WHERE invoice_id IS NOT NULL;
CREATE INDEX finance_entries_payer_idx ON public.finance_entries (payer_id) WHERE payer_id IS NOT NULL;
CREATE INDEX finance_entries_owner_idx ON public.finance_entries (owner_id) WHERE owner_id IS NOT NULL;

ALTER TABLE public.finance_entries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.finance_entries FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.finance_entries TO service_role;

-- ---------------------------------------------------------------------------
-- What an invoice has been paid and refunded: completed, unreversed incomes
-- that name it, their unreversed refunds, and its linked Keepz payment.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.finance_invoice_totals(p_invoice_id uuid)
RETURNS TABLE (paid numeric, refunded numeric)
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  WITH inc AS (
    SELECT e.id, e.amount
    FROM public.finance_entries e
    WHERE e.invoice_id = p_invoice_id
      AND e.kind = 'income'
      AND e.status = 'completed'
      AND NOT EXISTS (SELECT 1 FROM public.finance_entries r WHERE r.reverses_id = e.id)
  ),
  ref AS (
    SELECT f.amount
    FROM public.finance_entries f
    JOIN inc ON inc.id = f.original_entry_id
    WHERE f.kind = 'refund'
      AND NOT EXISTS (SELECT 1 FROM public.finance_entries r WHERE r.reverses_id = f.id)
  ),
  kz AS (
    SELECT p.amount, p.refunded_amount
    FROM public.invoices i
    JOIN public.payments p ON p.id = i.payment_id
    WHERE i.id = p_invoice_id
      AND p.provider = 'keepz'
      AND p.status = 'succeeded'
      AND p.credited_at IS NOT NULL
  )
  SELECT
    coalesce((SELECT sum(amount) FROM inc), 0) + coalesce((SELECT sum(amount) FROM kz), 0),
    coalesce((SELECT sum(amount) FROM ref), 0) + coalesce((SELECT sum(refunded_amount) FROM kz), 0)
$$;

-- An income of p_amount may settle the invoice: it is issued or sent and the
-- money stays within its total. Locks the invoice row (cancel takes the same
-- lock), so two payments cannot both squeeze into the last lari.
CREATE OR REPLACE FUNCTION public.finance_check_invoice_room(p_invoice_id uuid, p_amount numeric)
RETURNS void
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_invoice public.invoices%ROWTYPE;
  v_paid numeric;
  v_refunded numeric;
BEGIN
  SELECT * INTO v_invoice FROM public.invoices WHERE id = p_invoice_id FOR UPDATE;
  IF NOT FOUND OR v_invoice.status NOT IN ('issued', 'sent') THEN
    RAISE EXCEPTION 'FINANCE_INVOICE_NOT_PAYABLE' USING ERRCODE = '55000';
  END IF;
  SELECT t.paid, t.refunded INTO v_paid, v_refunded
  FROM public.finance_invoice_totals(p_invoice_id) t;
  IF v_paid - v_refunded + p_amount > v_invoice.total THEN
    RAISE EXCEPTION 'FINANCE_INVOICE_OVERPAID' USING ERRCODE = '22023';
  END IF;
END;
$$;

-- Third-party money still owed, per owner (spec §6).
CREATE OR REPLACE FUNCTION public.finance_owner_payables()
RETURNS TABLE (
  owner_id uuid,
  owner_name text,
  collected numeric,
  refunded numeric,
  paid_out numeric,
  outstanding numeric,
  last_activity timestamptz
)
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  WITH live AS (
    SELECT e.owner_id, e.owner_name, e.kind, e.amount, e.owner_amount, e.occurred_at
    FROM public.finance_entries e
    WHERE e.kind IN ('income', 'refund', 'owner_payout')
      AND (e.kind <> 'income' OR e.status = 'completed')
      AND (e.owner_amount > 0 OR e.kind = 'owner_payout')
      AND NOT EXISTS (SELECT 1 FROM public.finance_entries r WHERE r.reverses_id = e.id)
  )
  SELECT
    l.owner_id,
    coalesce((SELECT p.display_name FROM public.profiles p WHERE p.id = l.owner_id), max(l.owner_name)),
    coalesce(sum(l.owner_amount) FILTER (WHERE l.kind = 'income'), 0),
    coalesce(sum(l.owner_amount) FILTER (WHERE l.kind = 'refund'), 0),
    coalesce(sum(l.amount) FILTER (WHERE l.kind = 'owner_payout'), 0),
    coalesce(sum(l.owner_amount) FILTER (WHERE l.kind = 'income'), 0)
      - coalesce(sum(l.owner_amount) FILTER (WHERE l.kind = 'refund'), 0)
      - coalesce(sum(l.amount) FILTER (WHERE l.kind = 'owner_payout'), 0),
    max(l.occurred_at)
  FROM live l
  GROUP BY l.owner_id
$$;

CREATE OR REPLACE FUNCTION public.finance_entries_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_orig public.finance_entries%ROWTYPE;
  v_refunded numeric;
  v_owner_refunded numeric;
  v_outstanding numeric;
  c_mutable CONSTANT text[] := ARRAY[
    'status', 'occurred_at', 'updated_at',
    'payer_id', 'owner_id', 'property_id', 'service_id', 'created_by'
  ];
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF (to_jsonb(NEW) - c_mutable) IS DISTINCT FROM (to_jsonb(OLD) - c_mutable) THEN
      RAISE EXCEPTION 'FINANCE_RECORD_IMMUTABLE' USING ERRCODE = '55000';
    END IF;
    -- References only ever clear (ON DELETE SET NULL of a deleted account
    -- or listing); the name snapshots stay.
    IF (NEW.payer_id IS DISTINCT FROM OLD.payer_id AND NEW.payer_id IS NOT NULL)
       OR (NEW.owner_id IS DISTINCT FROM OLD.owner_id AND NEW.owner_id IS NOT NULL)
       OR (NEW.property_id IS DISTINCT FROM OLD.property_id AND NEW.property_id IS NOT NULL)
       OR (NEW.service_id IS DISTINCT FROM OLD.service_id AND NEW.service_id IS NOT NULL)
       OR (NEW.created_by IS DISTINCT FROM OLD.created_by AND NEW.created_by IS NOT NULL) THEN
      RAISE EXCEPTION 'FINANCE_RECORD_IMMUTABLE' USING ERRCODE = '55000';
    END IF;
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      -- Only a pending income moves, once: completed, failed or cancelled.
      IF OLD.kind <> 'income' OR OLD.status <> 'pending'
         OR NEW.status NOT IN ('completed', 'failed', 'cancelled') THEN
        RAISE EXCEPTION 'FINANCE_STATUS_TRANSITION' USING ERRCODE = '55000';
      END IF;
      IF NEW.status = 'completed' AND NEW.invoice_id IS NOT NULL THEN
        PERFORM public.finance_check_invoice_room(NEW.invoice_id, NEW.amount);
      END IF;
    END IF;
    -- The date moves only when a pending income is completed (the day the
    -- money arrived).
    IF NEW.occurred_at IS DISTINCT FROM OLD.occurred_at
       AND NOT (OLD.status = 'pending' AND NEW.status = 'completed') THEN
      RAISE EXCEPTION 'FINANCE_RECORD_IMMUTABLE' USING ERRCODE = '55000';
    END IF;
    NEW.updated_at := now();
    RETURN NEW;
  END IF;

  -- INSERT
  NEW.created_at := now();
  NEW.updated_at := now();
  IF NEW.kind <> 'income' THEN
    NEW.status := 'completed';
  ELSIF NEW.status NOT IN ('pending', 'completed') THEN
    RAISE EXCEPTION 'FINANCE_STATUS_TRANSITION' USING ERRCODE = '22023';
  END IF;

  IF NEW.kind = 'reversal' THEN
    SELECT * INTO v_orig FROM public.finance_entries WHERE id = NEW.reverses_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'FINANCE_ENTRY_NOT_FOUND' USING ERRCODE = 'P0002';
    END IF;
    IF v_orig.kind = 'reversal' OR (v_orig.kind = 'income' AND v_orig.status <> 'completed') THEN
      RAISE EXCEPTION 'FINANCE_REVERSAL_INVALID' USING ERRCODE = '22023';
    END IF;
    IF EXISTS (SELECT 1 FROM public.finance_entries r WHERE r.reverses_id = v_orig.id) THEN
      RAISE EXCEPTION 'FINANCE_ALREADY_REVERSED' USING ERRCODE = '23505';
    END IF;
    IF v_orig.kind = 'income' AND EXISTS (
      SELECT 1 FROM public.finance_entries f
      WHERE f.kind = 'refund' AND f.original_entry_id = v_orig.id
        AND NOT EXISTS (SELECT 1 FROM public.finance_entries r WHERE r.reverses_id = f.id)
    ) THEN
      RAISE EXCEPTION 'FINANCE_REVERSAL_HAS_REFUNDS' USING ERRCODE = '55000';
    END IF;
    IF char_length(btrim(coalesce(NEW.note, ''))) = 0 THEN
      RAISE EXCEPTION 'FINANCE_NOTE_REQUIRED' USING ERRCODE = '22023';
    END IF;
    -- A reversal mirrors its original exactly and lands in its period, so
    -- the pair nets to zero there; created_at records when it was made.
    NEW.amount := v_orig.amount;
    NEW.owner_amount := v_orig.owner_amount;
    NEW.revenue_type := v_orig.revenue_type;
    NEW.payment_method := v_orig.payment_method;
    NEW.provider_name := v_orig.provider_name;
    NEW.payer_id := v_orig.payer_id;
    NEW.payer_name := v_orig.payer_name;
    NEW.payer_tax_id := v_orig.payer_tax_id;
    NEW.owner_id := v_orig.owner_id;
    NEW.owner_name := v_orig.owner_name;
    NEW.property_id := v_orig.property_id;
    NEW.service_id := v_orig.service_id;
    NEW.invoice_id := NULL;
    NEW.original_entry_id := NULL;
    NEW.occurred_at := v_orig.occurred_at;
    RETURN NEW;
  END IF;

  IF NEW.payer_id IS NOT NULL AND NEW.payer_name IS NULL THEN
    SELECT p.display_name INTO NEW.payer_name FROM public.profiles p WHERE p.id = NEW.payer_id;
  END IF;
  IF NEW.owner_id IS NOT NULL AND NEW.owner_name IS NULL THEN
    SELECT p.display_name INTO NEW.owner_name FROM public.profiles p WHERE p.id = NEW.owner_id;
  END IF;

  IF NEW.kind = 'income' THEN
    IF NEW.owner_amount > 0 AND NEW.owner_id IS NULL THEN
      RAISE EXCEPTION 'FINANCE_OWNER_REQUIRED' USING ERRCODE = '22023';
    END IF;
    IF NEW.owner_amount = 0 THEN
      NEW.owner_id := NULL;
      NEW.owner_name := NULL;
    END IF;
    IF NEW.invoice_id IS NOT NULL THEN
      IF NEW.status = 'completed' THEN
        PERFORM public.finance_check_invoice_room(NEW.invoice_id, NEW.amount);
      ELSE
        PERFORM 1 FROM public.invoices i
        WHERE i.id = NEW.invoice_id AND i.status IN ('issued', 'sent');
        IF NOT FOUND THEN
          RAISE EXCEPTION 'FINANCE_INVOICE_NOT_PAYABLE' USING ERRCODE = '55000';
        END IF;
      END IF;
    END IF;
  ELSIF NEW.kind = 'refund' THEN
    SELECT * INTO v_orig FROM public.finance_entries WHERE id = NEW.original_entry_id FOR UPDATE;
    IF NOT FOUND OR v_orig.kind <> 'income' OR v_orig.status <> 'completed'
       OR EXISTS (SELECT 1 FROM public.finance_entries r WHERE r.reverses_id = v_orig.id) THEN
      RAISE EXCEPTION 'FINANCE_REFUND_ORIGINAL_INVALID' USING ERRCODE = '22023';
    END IF;
    SELECT coalesce(sum(f.amount), 0), coalesce(sum(f.owner_amount), 0)
    INTO v_refunded, v_owner_refunded
    FROM public.finance_entries f
    WHERE f.kind = 'refund' AND f.original_entry_id = v_orig.id
      AND NOT EXISTS (SELECT 1 FROM public.finance_entries r WHERE r.reverses_id = f.id);
    IF v_refunded + NEW.amount > v_orig.amount THEN
      RAISE EXCEPTION 'FINANCE_REFUND_EXCEEDS' USING ERRCODE = '22023';
    END IF;
    IF v_owner_refunded + NEW.owner_amount > v_orig.owner_amount THEN
      RAISE EXCEPTION 'FINANCE_REFUND_OWNER_EXCEEDS' USING ERRCODE = '22023';
    END IF;
    IF char_length(btrim(coalesce(NEW.note, ''))) = 0 THEN
      RAISE EXCEPTION 'FINANCE_NOTE_REQUIRED' USING ERRCODE = '22023';
    END IF;
    -- A refund is about its original: same type, payer, owner and listing.
    NEW.revenue_type := v_orig.revenue_type;
    NEW.payer_id := v_orig.payer_id;
    NEW.payer_name := v_orig.payer_name;
    NEW.payer_tax_id := v_orig.payer_tax_id;
    NEW.owner_id := CASE WHEN NEW.owner_amount > 0 THEN v_orig.owner_id END;
    NEW.owner_name := CASE WHEN NEW.owner_amount > 0 THEN v_orig.owner_name END;
    NEW.property_id := v_orig.property_id;
    NEW.service_id := v_orig.service_id;
  ELSIF NEW.kind = 'adjustment' THEN
    IF char_length(btrim(coalesce(NEW.note, ''))) = 0 THEN
      RAISE EXCEPTION 'FINANCE_NOTE_REQUIRED' USING ERRCODE = '22023';
    END IF;
    NEW.owner_amount := 0;
    NEW.owner_id := NULL;
    NEW.owner_name := NULL;
  ELSIF NEW.kind = 'owner_payout' THEN
    IF NEW.owner_id IS NULL THEN
      RAISE EXCEPTION 'FINANCE_OWNER_REQUIRED' USING ERRCODE = '22023';
    END IF;
    NEW.revenue_type := NULL;
    NEW.owner_amount := NEW.amount;
    -- One payout per owner at a time, and never more than is owed.
    PERFORM pg_advisory_xact_lock(hashtextextended('finance-owner:' || NEW.owner_id::text, 0));
    SELECT coalesce(sum(op.outstanding), 0) INTO v_outstanding
    FROM public.finance_owner_payables() op
    WHERE op.owner_id = NEW.owner_id;
    IF NEW.amount > v_outstanding THEN
      RAISE EXCEPTION 'FINANCE_PAYOUT_EXCEEDS' USING ERRCODE = '22023';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER finance_entries_guard
  BEFORE INSERT OR UPDATE ON public.finance_entries
  FOR EACH ROW EXECUTE FUNCTION public.finance_entries_guard();

CREATE TRIGGER finance_entries_forbid_delete
  BEFORE DELETE ON public.finance_entries
  FOR EACH ROW EXECUTE FUNCTION public.finance_forbid_delete();

CREATE TRIGGER trg_audit_row
  AFTER INSERT OR DELETE OR UPDATE ON public.finance_entries
  FOR EACH ROW EXECUTE FUNCTION public.audit_row_change();

-- ---------------------------------------------------------------------------
-- Invoice content is priced here and frozen once issued.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.invoices_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_items jsonb := '[]'::jsonb;
  v_item jsonb;
  v_desc text;
  v_qty numeric;
  v_price numeric;
  v_amount numeric;
  v_subtotal numeric := 0;
  v_base numeric;
  v_paid numeric;
  v_refunded numeric;
  v_payment numeric;
  c_open CONSTANT text[] := ARRAY[
    'status', 'sent_at', 'sent_count', 'last_sent_to', 'share_token_hash',
    'share_expires_at', 'cancelled_at', 'cancel_reason', 'updated_at',
    'recipient_profile_id', 'created_by', 'payment_id'
  ];
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.status <> 'draft' THEN
    -- Issued content is frozen: a correction is cancel + duplicate.
    IF (to_jsonb(NEW) - c_open) IS DISTINCT FROM (to_jsonb(OLD) - c_open) THEN
      RAISE EXCEPTION 'FINANCE_INVOICE_LOCKED' USING ERRCODE = '55000';
    END IF;
    IF NEW.status IS DISTINCT FROM OLD.status AND NOT (
         (OLD.status = 'issued' AND NEW.status IN ('sent', 'cancelled'))
         OR (OLD.status = 'sent' AND NEW.status = 'cancelled')) THEN
      RAISE EXCEPTION 'FINANCE_STATUS_TRANSITION' USING ERRCODE = '55000';
    END IF;
    IF OLD.status = 'cancelled' AND (
         NEW.sent_count <> OLD.sent_count
         OR NEW.share_token_hash IS NOT NULL
         OR NEW.payment_id IS DISTINCT FROM OLD.payment_id) THEN
      RAISE EXCEPTION 'FINANCE_INVOICE_LOCKED' USING ERRCODE = '55000';
    END IF;
    IF (NEW.recipient_profile_id IS DISTINCT FROM OLD.recipient_profile_id AND NEW.recipient_profile_id IS NOT NULL)
       OR (NEW.created_by IS DISTINCT FROM OLD.created_by AND NEW.created_by IS NOT NULL) THEN
      RAISE EXCEPTION 'FINANCE_INVOICE_LOCKED' USING ERRCODE = '55000';
    END IF;
    IF NEW.payment_id IS DISTINCT FROM OLD.payment_id THEN
      -- A Keepz payment is linked once, to an open invoice, within its total.
      IF OLD.payment_id IS NOT NULL OR NEW.status NOT IN ('issued', 'sent') THEN
        RAISE EXCEPTION 'FINANCE_INVOICE_LOCKED' USING ERRCODE = '55000';
      END IF;
      SELECT p.amount - p.refunded_amount INTO v_payment
      FROM public.payments p
      WHERE p.id = NEW.payment_id AND p.provider = 'keepz'
        AND p.status = 'succeeded' AND p.credited_at IS NOT NULL;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'FINANCE_PAYMENT_NOT_LINKABLE' USING ERRCODE = '22023';
      END IF;
      SELECT t.paid, t.refunded INTO v_paid, v_refunded FROM public.finance_invoice_totals(OLD.id) t;
      IF v_paid - v_refunded + v_payment > NEW.total THEN
        RAISE EXCEPTION 'FINANCE_INVOICE_OVERPAID' USING ERRCODE = '22023';
      END IF;
    END IF;
    IF NEW.status = 'cancelled' THEN
      NEW.share_token_hash := NULL;
      NEW.share_expires_at := NULL;
    END IF;
    NEW.updated_at := now();
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.created_at := now();
    IF NEW.status <> 'draft' THEN
      RAISE EXCEPTION 'FINANCE_STATUS_TRANSITION' USING ERRCODE = '22023';
    END IF;
  END IF;

  -- A draft (or its first step out of draft). Only finance_issue_invoice()
  -- may issue: it sets finance.issuing for its own statement.
  IF NEW.status = 'issued' THEN
    IF current_setting('finance.issuing', true) IS DISTINCT FROM 'on' THEN
      RAISE EXCEPTION 'FINANCE_STATUS_TRANSITION' USING ERRCODE = '55000';
    END IF;
  ELSIF NEW.status IN ('draft', 'cancelled') THEN
    IF NEW.invoice_number IS NOT NULL OR NEW.issuer IS NOT NULL OR NEW.issue_date IS NOT NULL
       OR NEW.issued_at IS NOT NULL THEN
      RAISE EXCEPTION 'FINANCE_STATUS_TRANSITION' USING ERRCODE = '22023';
    END IF;
  ELSE
    RAISE EXCEPTION 'FINANCE_STATUS_TRANSITION' USING ERRCODE = '22023';
  END IF;
  -- Drafts are not sent, shared or paid.
  IF NEW.sent_count <> 0 OR NEW.sent_at IS NOT NULL OR NEW.share_token_hash IS NOT NULL
     OR NEW.payment_id IS NOT NULL THEN
    RAISE EXCEPTION 'FINANCE_STATUS_TRANSITION' USING ERRCODE = '22023';
  END IF;

  IF jsonb_typeof(NEW.items) <> 'array' OR jsonb_array_length(NEW.items) NOT BETWEEN 1 AND 50 THEN
    RAISE EXCEPTION 'FINANCE_INVOICE_ITEMS_INVALID' USING ERRCODE = '22023';
  END IF;
  FOR v_item IN SELECT value FROM jsonb_array_elements(NEW.items) LOOP
    IF jsonb_typeof(v_item) <> 'object'
       OR jsonb_typeof(v_item -> 'description') IS DISTINCT FROM 'string'
       OR jsonb_typeof(v_item -> 'quantity') IS DISTINCT FROM 'number'
       OR jsonb_typeof(v_item -> 'unit_price') IS DISTINCT FROM 'number' THEN
      RAISE EXCEPTION 'FINANCE_INVOICE_ITEMS_INVALID' USING ERRCODE = '22023';
    END IF;
    v_desc := btrim(v_item ->> 'description');
    v_qty := (v_item ->> 'quantity')::numeric;
    v_price := (v_item ->> 'unit_price')::numeric;
    IF char_length(v_desc) NOT BETWEEN 1 AND 300
       OR v_qty <= 0 OR v_qty > 100000 OR v_qty <> round(v_qty, 3)
       OR v_price < 0 OR v_price > 10000000 OR v_price <> round(v_price, 2) THEN
      RAISE EXCEPTION 'FINANCE_INVOICE_ITEMS_INVALID' USING ERRCODE = '22023';
    END IF;
    v_amount := round(v_qty * v_price, 2);
    v_subtotal := v_subtotal + v_amount;
    v_items := v_items || jsonb_build_array(jsonb_build_object(
      'description', v_desc,
      'quantity', v_qty,
      'unit_price', v_price,
      'amount', v_amount
    ));
  END LOOP;

  IF NEW.discount_amount IS NULL OR NEW.discount_amount < 0
     OR NEW.discount_amount > v_subtotal
     OR NEW.discount_amount <> round(NEW.discount_amount, 2) THEN
    RAISE EXCEPTION 'FINANCE_INVOICE_DISCOUNT_INVALID' USING ERRCODE = '22023';
  END IF;

  NEW.items := v_items;
  NEW.subtotal := v_subtotal;
  v_base := v_subtotal - NEW.discount_amount;
  NEW.vat_amount := CASE WHEN NEW.vat_rate IS NULL THEN 0 ELSE round(v_base * NEW.vat_rate / 100, 2) END;
  NEW.total := v_base + NEW.vat_amount;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER invoices_guard
  BEFORE INSERT OR UPDATE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.invoices_guard();

CREATE TRIGGER invoices_forbid_delete
  BEFORE DELETE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.finance_forbid_delete();

CREATE TRIGGER trg_audit_row
  AFTER INSERT OR DELETE OR UPDATE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.audit_row_change();

CREATE TRIGGER trg_audit_row
  AFTER INSERT OR DELETE OR UPDATE ON public.invoice_templates
  FOR EACH ROW EXECUTE FUNCTION public.audit_row_change();

-- Issue a draft: the next number of the Tbilisi calendar year, the issuer
-- snapshot, the issue date and (when unset) the default due date.
CREATE OR REPLACE FUNCTION public.finance_issue_invoice(p_invoice_id uuid)
RETURNS text
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_invoice public.invoices%ROWTYPE;
  v_settings public.finance_settings%ROWTYPE;
  v_date date := (now() AT TIME ZONE 'Asia/Tbilisi')::date;
  v_year integer := extract(year FROM (now() AT TIME ZONE 'Asia/Tbilisi'))::integer;
  v_seq integer;
  v_number text;
BEGIN
  SELECT * INTO v_invoice FROM public.invoices WHERE id = p_invoice_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'FINANCE_INVOICE_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  IF v_invoice.status <> 'draft' THEN
    RAISE EXCEPTION 'FINANCE_STATUS_TRANSITION' USING ERRCODE = '55000';
  END IF;
  IF v_invoice.total <= 0 THEN
    RAISE EXCEPTION 'FINANCE_INVOICE_EMPTY' USING ERRCODE = '22023';
  END IF;
  IF v_invoice.due_date IS NOT NULL AND v_invoice.due_date < v_date THEN
    RAISE EXCEPTION 'FINANCE_INVOICE_DUE_DATE_INVALID' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_settings FROM public.finance_settings WHERE id;
  IF char_length(btrim(coalesce(v_settings.legal_name, ''))) = 0
     OR char_length(btrim(coalesce(v_settings.tax_id, ''))) = 0 THEN
    RAISE EXCEPTION 'FINANCE_ISSUER_INCOMPLETE' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.invoice_counters (year, last_number)
  VALUES (v_year, 0)
  ON CONFLICT (year) DO NOTHING;
  UPDATE public.invoice_counters
  SET last_number = last_number + 1
  WHERE year = v_year
  RETURNING last_number INTO v_seq;
  v_number := v_settings.invoice_prefix || '-' || v_year::text || '-'
    || lpad(v_seq::text, greatest(4, char_length(v_seq::text)), '0');

  PERFORM set_config('finance.issuing', 'on', true);
  UPDATE public.invoices
  SET status = 'issued',
      invoice_number = v_number,
      number_year = v_year,
      number_seq = v_seq,
      issue_date = v_date,
      issued_at = now(),
      due_date = coalesce(v_invoice.due_date, v_date + v_settings.invoice_due_days),
      terms = coalesce(v_invoice.terms, v_settings.invoice_terms),
      issuer = jsonb_build_object(
        'legal_name', v_settings.legal_name,
        'tax_id', v_settings.tax_id,
        'address', v_settings.legal_address,
        'email', v_settings.email,
        'phone', v_settings.phone,
        'bank_name', v_settings.bank_name,
        'bank_iban', v_settings.bank_iban,
        'bank_swift', v_settings.bank_swift,
        'vat_registered', v_settings.vat_registered
      )
  WHERE id = p_invoice_id;
  PERFORM set_config('finance.issuing', 'off', true);
  RETURN v_number;
END;
$$;

-- Cancel an invoice nobody has paid (net of refunds). Keeps its number.
CREATE OR REPLACE FUNCTION public.finance_cancel_invoice(p_invoice_id uuid, p_reason text)
RETURNS void
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_invoice public.invoices%ROWTYPE;
  v_paid numeric;
  v_refunded numeric;
BEGIN
  SELECT * INTO v_invoice FROM public.invoices WHERE id = p_invoice_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'FINANCE_INVOICE_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  IF v_invoice.status = 'cancelled' THEN
    RETURN;
  END IF;
  IF char_length(btrim(coalesce(p_reason, ''))) NOT BETWEEN 1 AND 500 THEN
    RAISE EXCEPTION 'FINANCE_NOTE_REQUIRED' USING ERRCODE = '22023';
  END IF;
  SELECT t.paid, t.refunded INTO v_paid, v_refunded FROM public.finance_invoice_totals(p_invoice_id) t;
  IF v_paid - v_refunded > 0 THEN
    RAISE EXCEPTION 'FINANCE_INVOICE_HAS_PAYMENTS' USING ERRCODE = '55000';
  END IF;
  UPDATE public.invoices
  SET status = 'cancelled', cancelled_at = now(), cancel_reason = btrim(p_reason)
  WHERE id = p_invoice_id;
END;
$$;

-- Record a delivery (e-mail or shared link) of an issued invoice.
CREATE OR REPLACE FUNCTION public.finance_mark_invoice_sent(p_invoice_id uuid, p_to text)
RETURNS void
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_status text;
BEGIN
  SELECT status INTO v_status FROM public.invoices WHERE id = p_invoice_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'FINANCE_INVOICE_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  IF v_status NOT IN ('issued', 'sent') THEN
    RAISE EXCEPTION 'FINANCE_STATUS_TRANSITION' USING ERRCODE = '55000';
  END IF;
  UPDATE public.invoices
  SET status = 'sent',
      sent_at = now(),
      sent_count = sent_count + 1,
      last_sent_to = left(btrim(coalesce(p_to, '')), 320)
  WHERE id = p_invoice_id;
END;
$$;

-- ===========================================================================
-- Expenses (spec §11)
-- ===========================================================================

CREATE TABLE public.finance_expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_no bigint GENERATED ALWAYS AS IDENTITY,
  kind text NOT NULL DEFAULT 'expense',
  reverses_id uuid REFERENCES public.finance_expenses(id),
  expense_date date NOT NULL,
  supplier_name text NOT NULL,
  supplier_tax_id text,
  category text NOT NULL,
  document_number text,
  amount numeric(12,2) NOT NULL,
  vat_amount numeric(12,2) NOT NULL DEFAULT 0,
  payment_method text NOT NULL,
  note text,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT finance_expenses_expense_no_key UNIQUE (expense_no),
  CONSTRAINT finance_expenses_reverses_id_key UNIQUE (reverses_id),
  CONSTRAINT finance_expenses_kind_check CHECK (kind IN ('expense', 'reversal')),
  CONSTRAINT finance_expenses_reversal_link_check CHECK ((kind = 'reversal') = (reverses_id IS NOT NULL)),
  CONSTRAINT finance_expenses_category_check CHECK (category IN (
    'software_hosting', 'marketing', 'payment_fees', 'salaries',
    'professional_services', 'rent_utilities', 'communications', 'taxes_fees',
    'equipment', 'transport', 'other'
  )),
  CONSTRAINT finance_expenses_payment_method_check
    CHECK (payment_method IN ('card', 'bank_transfer', 'cash', 'payment_provider')),
  CONSTRAINT finance_expenses_amount_check CHECK (amount > 0 AND amount <= 10000000),
  CONSTRAINT finance_expenses_vat_check CHECK (vat_amount >= 0 AND vat_amount <= amount),
  CONSTRAINT finance_expenses_date_check CHECK (expense_date BETWEEN DATE '2020-01-01' AND DATE '2100-12-31'),
  CONSTRAINT finance_expenses_text_check CHECK (
    char_length(btrim(supplier_name)) BETWEEN 1 AND 200
    AND char_length(coalesce(supplier_tax_id, '')) <= 50
    AND char_length(coalesce(document_number, '')) <= 100
    AND char_length(coalesce(note, '')) <= 1000
  )
);

CREATE INDEX finance_expenses_date_idx ON public.finance_expenses (expense_date DESC);

ALTER TABLE public.finance_expenses ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.finance_expenses FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.finance_expenses TO service_role;

CREATE OR REPLACE FUNCTION public.finance_expenses_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_orig public.finance_expenses%ROWTYPE;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    -- Only the author reference may clear (ON DELETE SET NULL).
    IF (to_jsonb(NEW) - 'created_by') IS DISTINCT FROM (to_jsonb(OLD) - 'created_by')
       OR NEW.created_by IS NOT NULL THEN
      RAISE EXCEPTION 'FINANCE_RECORD_IMMUTABLE' USING ERRCODE = '55000';
    END IF;
    RETURN NEW;
  END IF;

  NEW.created_at := now();
  IF NEW.kind = 'reversal' THEN
    SELECT * INTO v_orig FROM public.finance_expenses WHERE id = NEW.reverses_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'FINANCE_ENTRY_NOT_FOUND' USING ERRCODE = 'P0002';
    END IF;
    IF v_orig.kind <> 'expense' THEN
      RAISE EXCEPTION 'FINANCE_REVERSAL_INVALID' USING ERRCODE = '22023';
    END IF;
    IF EXISTS (SELECT 1 FROM public.finance_expenses r WHERE r.reverses_id = v_orig.id) THEN
      RAISE EXCEPTION 'FINANCE_ALREADY_REVERSED' USING ERRCODE = '23505';
    END IF;
    IF char_length(btrim(coalesce(NEW.note, ''))) = 0 THEN
      RAISE EXCEPTION 'FINANCE_NOTE_REQUIRED' USING ERRCODE = '22023';
    END IF;
    NEW.expense_date := v_orig.expense_date;
    NEW.supplier_name := v_orig.supplier_name;
    NEW.supplier_tax_id := v_orig.supplier_tax_id;
    NEW.category := v_orig.category;
    NEW.document_number := v_orig.document_number;
    NEW.amount := v_orig.amount;
    NEW.vat_amount := v_orig.vat_amount;
    NEW.payment_method := v_orig.payment_method;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER finance_expenses_guard
  BEFORE INSERT OR UPDATE ON public.finance_expenses
  FOR EACH ROW EXECUTE FUNCTION public.finance_expenses_guard();

CREATE TRIGGER finance_expenses_forbid_delete
  BEFORE DELETE ON public.finance_expenses
  FOR EACH ROW EXECUTE FUNCTION public.finance_forbid_delete();

CREATE TRIGGER trg_audit_row
  AFTER INSERT OR DELETE OR UPDATE ON public.finance_expenses
  FOR EACH ROW EXECUTE FUNCTION public.audit_row_change();

-- ===========================================================================
-- Primary documents archive (spec §12): private bucket, service role only
-- ===========================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'finance-documents',
  'finance-documents',
  false,
  10485760,
  array['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

CREATE TABLE public.finance_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_no bigint GENERATED ALWAYS AS IDENTITY,
  doc_type text NOT NULL,
  title text NOT NULL,
  document_number text,
  document_date date,
  counterparty text,
  amount numeric(12,2),
  storage_path text NOT NULL,
  file_name text NOT NULL,
  content_type text NOT NULL,
  byte_size integer NOT NULL,
  sha256 text NOT NULL,
  -- What the document proves (at most one link).
  entry_id uuid REFERENCES public.finance_entries(id),
  expense_id uuid REFERENCES public.finance_expenses(id),
  invoice_id uuid REFERENCES public.invoices(id),
  payment_id uuid REFERENCES public.payments(id),
  refund_id uuid REFERENCES public.payment_refunds(id),
  status text NOT NULL DEFAULT 'active',
  void_reason text,
  voided_at timestamptz,
  voided_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  uploaded_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT finance_documents_document_no_key UNIQUE (document_no),
  CONSTRAINT finance_documents_storage_path_key UNIQUE (storage_path),
  CONSTRAINT finance_documents_doc_type_check CHECK (doc_type IN (
    'invoice', 'contract', 'receipt', 'bank_confirmation', 'refund_document', 'other'
  )),
  CONSTRAINT finance_documents_status_check CHECK (status IN ('active', 'voided')),
  CONSTRAINT finance_documents_void_check CHECK (
    (status = 'voided') = (voided_at IS NOT NULL)
    AND (status <> 'voided' OR char_length(btrim(coalesce(void_reason, ''))) BETWEEN 1 AND 500)
  ),
  CONSTRAINT finance_documents_content_type_check
    CHECK (content_type IN ('application/pdf', 'image/jpeg', 'image/png', 'image/webp')),
  CONSTRAINT finance_documents_byte_size_check CHECK (byte_size BETWEEN 1 AND 10485760),
  CONSTRAINT finance_documents_path_check
    CHECK (storage_path ~ '^[0-9a-f-]{36}\.(pdf|jpg|png|webp)$'),
  CONSTRAINT finance_documents_sha256_check CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  CONSTRAINT finance_documents_link_check
    CHECK (num_nonnulls(entry_id, expense_id, invoice_id, payment_id, refund_id) <= 1),
  CONSTRAINT finance_documents_text_check CHECK (
    char_length(btrim(title)) BETWEEN 1 AND 200
    AND char_length(coalesce(document_number, '')) <= 100
    AND char_length(coalesce(counterparty, '')) <= 200
    AND char_length(file_name) BETWEEN 1 AND 255
  ),
  CONSTRAINT finance_documents_amount_check CHECK (amount IS NULL OR (amount >= 0 AND amount <= 100000000))
);

CREATE INDEX finance_documents_created_idx ON public.finance_documents (created_at DESC);
CREATE INDEX finance_documents_expense_idx ON public.finance_documents (expense_id) WHERE expense_id IS NOT NULL;
CREATE INDEX finance_documents_entry_idx ON public.finance_documents (entry_id) WHERE entry_id IS NOT NULL;
CREATE INDEX finance_documents_invoice_idx ON public.finance_documents (invoice_id) WHERE invoice_id IS NOT NULL;

ALTER TABLE public.finance_documents ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.finance_documents FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.finance_documents TO service_role;

CREATE OR REPLACE FUNCTION public.finance_documents_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  c_mutable CONSTANT text[] := ARRAY[
    'status', 'void_reason', 'voided_at', 'voided_by', 'uploaded_by'
  ];
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.created_at := now();
    IF NEW.status <> 'active' THEN
      RAISE EXCEPTION 'FINANCE_STATUS_TRANSITION' USING ERRCODE = '22023';
    END IF;
    RETURN NEW;
  END IF;
  IF (to_jsonb(NEW) - c_mutable) IS DISTINCT FROM (to_jsonb(OLD) - c_mutable)
     OR (NEW.uploaded_by IS DISTINCT FROM OLD.uploaded_by AND NEW.uploaded_by IS NOT NULL) THEN
    RAISE EXCEPTION 'FINANCE_RECORD_IMMUTABLE' USING ERRCODE = '55000';
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    -- A document is voided once (with a reason); it is never removed.
    IF OLD.status <> 'active' OR NEW.status <> 'voided' THEN
      RAISE EXCEPTION 'FINANCE_STATUS_TRANSITION' USING ERRCODE = '55000';
    END IF;
    NEW.voided_at := now();
  ELSIF NEW.void_reason IS DISTINCT FROM OLD.void_reason
        OR NEW.voided_at IS DISTINCT FROM OLD.voided_at
        OR (NEW.voided_by IS DISTINCT FROM OLD.voided_by AND NEW.voided_by IS NOT NULL) THEN
    RAISE EXCEPTION 'FINANCE_RECORD_IMMUTABLE' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER finance_documents_guard
  BEFORE INSERT OR UPDATE ON public.finance_documents
  FOR EACH ROW EXECUTE FUNCTION public.finance_documents_guard();

CREATE TRIGGER finance_documents_forbid_delete
  BEFORE DELETE ON public.finance_documents
  FOR EACH ROW EXECUTE FUNCTION public.finance_forbid_delete();

CREATE TRIGGER trg_audit_row
  AFTER INSERT OR DELETE OR UPDATE ON public.finance_documents
  FOR EACH ROW EXECUTE FUNCTION public.audit_row_change();

-- ===========================================================================
-- Registers (views, service role only)
-- ===========================================================================

-- Payments register (spec §4) and, filtered to money received, the revenue
-- journal (spec §2): every Keepz payment attempt plus every manual income.
CREATE VIEW public.finance_payments_v
WITH (security_invoker = true)
AS
WITH u AS (
  SELECT
    'keepz'::text AS source,
    p.id,
    NULL::bigint AS entry_no,
    p.provider_transaction_id AS reference,
    coalesce(p.completed_at, p.created_at) AS occurred_at,
    p.created_at,
    p.user_id AS payer_id,
    pr.display_name AS payer_name,
    NULL::text AS payer_tax_id,
    'card'::text AS payment_method,
    'Keepz'::text AS provider_name,
    public.finance_intent_revenue_type(p.resume) AS revenue_type,
    CASE WHEN p.resume ->> 'kind' = 'purchase-vip'
      THEN public.finance_try_uuid(p.resume -> 'body' ->> 'property_id') END AS property_id,
    CASE
      WHEN p.resume ->> 'kind' = 'purchase-vip'
        THEN public.finance_try_uuid(p.resume -> 'body' ->> 'service_id')
      WHEN p.resume ->> 'kind' = 'menu-item-discount'
        THEN (SELECT mi.service_id FROM public.service_menu_items mi
              WHERE mi.id = public.finance_try_uuid(p.resume -> 'body' ->> 'menuItemId'))
    END AS service_id,
    p.amount,
    CASE WHEN p.status = 'succeeded' THEN p.refunded_amount ELSE 0 END AS refunded_amount,
    NULL::uuid AS owner_id,
    NULL::text AS owner_name,
    0::numeric AS owner_amount,
    0::numeric AS owner_refunded,
    CASE
      WHEN p.status = 'succeeded' AND p.credited_at IS NOT NULL THEN
        CASE
          WHEN p.refunded_amount >= p.amount THEN 'refunded'
          WHEN p.refunded_amount > 0 THEN 'partially_refunded'
          ELSE 'completed'
        END
      WHEN p.status IN ('pending', 'succeeded') THEN 'pending'
      WHEN p.status = 'declined' THEN 'failed'
      ELSE 'cancelled'
    END AS status,
    p.status AS source_status,
    false AS reversed,
    inv.id AS invoice_id,
    inv.invoice_number,
    p.review_flag,
    NULL::text AS note
  FROM public.payments p
  LEFT JOIN public.profiles pr ON pr.id = p.user_id
  LEFT JOIN public.invoices inv ON inv.payment_id = p.id
  WHERE p.provider = 'keepz'
  UNION ALL
  SELECT
    'manual'::text,
    e.id,
    e.entry_no,
    e.reference,
    e.occurred_at,
    e.created_at,
    e.payer_id,
    coalesce(pr.display_name, e.payer_name),
    e.payer_tax_id,
    e.payment_method,
    e.provider_name,
    e.revenue_type,
    e.property_id,
    e.service_id,
    e.amount,
    coalesce(rf.refunded, 0),
    e.owner_id,
    coalesce(ow.display_name, e.owner_name),
    e.owner_amount,
    coalesce(rf.owner_refunded, 0),
    CASE
      WHEN rv.id IS NOT NULL THEN 'cancelled'
      WHEN e.status = 'pending' THEN 'pending'
      WHEN e.status = 'failed' THEN 'failed'
      WHEN e.status = 'cancelled' THEN 'cancelled'
      WHEN coalesce(rf.refunded, 0) >= e.amount THEN 'refunded'
      WHEN coalesce(rf.refunded, 0) > 0 THEN 'partially_refunded'
      ELSE 'completed'
    END,
    e.status,
    rv.id IS NOT NULL,
    e.invoice_id,
    inv.invoice_number,
    NULL::text,
    e.note
  FROM public.finance_entries e
  LEFT JOIN public.profiles pr ON pr.id = e.payer_id
  LEFT JOIN public.profiles ow ON ow.id = e.owner_id
  LEFT JOIN public.invoices inv ON inv.id = e.invoice_id
  LEFT JOIN public.finance_entries rv ON rv.reverses_id = e.id
  LEFT JOIN LATERAL (
    SELECT sum(f.amount) AS refunded, sum(f.owner_amount) AS owner_refunded
    FROM public.finance_entries f
    WHERE f.kind = 'refund' AND f.original_entry_id = e.id
      AND NOT EXISTS (SELECT 1 FROM public.finance_entries r WHERE r.reverses_id = f.id)
  ) rf ON true
  WHERE e.kind = 'income'
)
SELECT
  u.*,
  u.amount - u.refunded_amount AS net_amount,
  u.owner_amount - u.owner_refunded AS owner_net,
  (u.amount - u.refunded_amount) - (u.owner_amount - u.owner_refunded) AS own_amount,
  coalesce(prop.title, svc.title) AS object_title
FROM u
LEFT JOIN public.properties prop ON prop.id = u.property_id
LEFT JOIN public.services svc ON svc.id = u.service_id;

-- Refunds register (spec §5): Keepz refunds, manual refunds, and Keepz
-- payments refunded on Keepz's side ('review': reconcile by hand, C32).
CREATE VIEW public.finance_refunds_v
WITH (security_invoker = true)
AS
SELECT
  'keepz'::text AS source,
  r.id,
  NULL::bigint AS entry_no,
  coalesce(r.resolved_at, r.created_at) AS occurred_at,
  r.created_at,
  'keepz'::text AS original_source,
  r.payment_id AS original_id,
  p.provider_transaction_id AS original_reference,
  p.amount AS original_amount,
  r.amount,
  0::numeric AS owner_amount,
  r.reason,
  CASE r.status
    WHEN 'succeeded' THEN 'completed'
    WHEN 'failed' THEN 'failed'
    ELSE 'pending'
  END AS status,
  r.status AS source_status,
  p.user_id AS payer_id,
  pr.display_name AS payer_name,
  'card'::text AS payment_method,
  public.finance_intent_revenue_type(p.resume) AS revenue_type,
  false AS reversed
FROM public.payment_refunds r
JOIN public.payments p ON p.id = r.payment_id
LEFT JOIN public.profiles pr ON pr.id = p.user_id
WHERE p.provider = 'keepz'
UNION ALL
SELECT
  'manual'::text,
  f.id,
  f.entry_no,
  f.occurred_at,
  f.created_at,
  'manual'::text,
  f.original_entry_id,
  coalesce(o.reference, 'FE-' || o.entry_no::text),
  o.amount,
  f.amount,
  f.owner_amount,
  f.note,
  CASE WHEN rv.id IS NOT NULL THEN 'cancelled' ELSE 'completed' END,
  'completed'::text,
  f.payer_id,
  coalesce(pr.display_name, f.payer_name),
  f.payment_method,
  f.revenue_type,
  rv.id IS NOT NULL
FROM public.finance_entries f
JOIN public.finance_entries o ON o.id = f.original_entry_id
LEFT JOIN public.finance_entries rv ON rv.reverses_id = f.id
LEFT JOIN public.profiles pr ON pr.id = f.payer_id
WHERE f.kind = 'refund'
UNION ALL
SELECT
  'keepz_external'::text,
  p.id,
  NULL::bigint,
  coalesce(p.last_checked_at, p.completed_at, p.created_at),
  p.created_at,
  'keepz'::text,
  p.id,
  p.provider_transaction_id,
  p.amount,
  NULL::numeric,
  0::numeric,
  NULL::text,
  'review'::text,
  p.review_flag,
  p.user_id,
  pr.display_name,
  'card'::text,
  public.finance_intent_revenue_type(p.resume),
  false
FROM public.payments p
LEFT JOIN public.profiles pr ON pr.id = p.user_id
WHERE p.provider = 'keepz' AND p.review_flag = 'external_refund';

-- Effective money movements: the one source of every period total.
--   flow     income | refund | adjustment (a reversal takes its original's)
--   amount   signed: income +, refund -, adjustment as entered; a reversal
--            negates its original
--   owner_amount  signed the same way (third-party share)
CREATE VIEW public.finance_ledger_v
WITH (security_invoker = true)
AS
SELECT
  'keepz'::text AS source,
  p.id AS record_id,
  p.completed_at AS occurred_at,
  'income'::text AS flow,
  p.amount AS amount,
  0::numeric AS owner_amount,
  public.finance_intent_revenue_type(p.resume) AS revenue_type
FROM public.payments p
WHERE p.provider = 'keepz' AND p.status = 'succeeded' AND p.credited_at IS NOT NULL
UNION ALL
SELECT
  'keepz'::text,
  r.id,
  coalesce(r.resolved_at, r.updated_at),
  'refund'::text,
  -r.amount,
  0::numeric,
  public.finance_intent_revenue_type(p.resume)
FROM public.payment_refunds r
JOIN public.payments p ON p.id = r.payment_id
WHERE p.provider = 'keepz' AND r.status = 'succeeded'
UNION ALL
SELECT
  'manual'::text,
  e.id,
  e.occurred_at,
  CASE WHEN e.kind = 'reversal' THEN o.kind ELSE e.kind END,
  CASE coalesce(o.kind, e.kind)
    WHEN 'income' THEN 1
    WHEN 'refund' THEN -1
    ELSE 1
  END * CASE WHEN e.kind = 'reversal' THEN -1 ELSE 1 END * e.amount,
  CASE coalesce(o.kind, e.kind)
    WHEN 'income' THEN 1
    WHEN 'refund' THEN -1
    ELSE 0
  END * CASE WHEN e.kind = 'reversal' THEN -1 ELSE 1 END * e.owner_amount,
  e.revenue_type
FROM public.finance_entries e
LEFT JOIN public.finance_entries o ON o.id = e.reverses_id
WHERE (e.kind = 'income' AND e.status = 'completed')
   OR e.kind IN ('refund', 'adjustment')
   OR (e.kind = 'reversal' AND o.kind IN ('income', 'refund', 'adjustment'));

-- Invoices register (spec §19) with what each has been paid.
CREATE VIEW public.finance_invoices_v
WITH (security_invoker = true)
AS
SELECT
  i.id,
  i.invoice_number,
  i.number_year,
  i.number_seq,
  i.status,
  i.issue_date,
  i.due_date,
  i.issuer,
  i.recipient_type,
  i.recipient_name,
  i.recipient_tax_id,
  i.recipient_address,
  i.recipient_email,
  i.recipient_phone,
  i.recipient_profile_id,
  i.items,
  i.subtotal,
  i.discount_amount,
  i.vat_rate,
  i.vat_amount,
  i.total,
  i.payment_method,
  i.payment_id,
  i.related_reference,
  i.notes,
  i.terms,
  i.share_token_hash IS NOT NULL AND i.share_expires_at > now() AS has_share_link,
  i.share_expires_at,
  i.sent_at,
  i.sent_count,
  i.last_sent_to,
  i.issued_at,
  i.cancelled_at,
  i.cancel_reason,
  i.duplicated_from,
  i.created_by,
  i.created_at,
  i.updated_at,
  t.paid AS paid_amount,
  t.refunded AS refunded_amount,
  t.paid - t.refunded AS net_paid,
  greatest(i.total - (t.paid - t.refunded), 0) AS remaining,
  CASE
    WHEN i.status = 'cancelled' THEN 'cancelled'
    WHEN i.status = 'draft' THEN 'draft'
    WHEN t.paid > 0 AND t.refunded >= t.paid THEN 'refunded'
    WHEN t.paid - t.refunded >= i.total THEN 'paid'
    WHEN i.due_date < (now() AT TIME ZONE 'Asia/Tbilisi')::date THEN 'overdue'
    WHEN t.paid - t.refunded > 0 THEN 'partially_paid'
    ELSE i.status
  END AS display_status,
  (i.status IN ('issued', 'sent')
    AND t.paid - t.refunded < i.total
    AND i.due_date < (now() AT TIME ZONE 'Asia/Tbilisi')::date) AS is_overdue
FROM public.invoices i
CROSS JOIN LATERAL public.finance_invoice_totals(i.id) t;

-- ===========================================================================
-- Period numbers (spec §1, §7-10). Months are Asia/Tbilisi calendar months.
-- ===========================================================================

-- Per month: received (income, gross of third-party shares), refunds,
-- adjustments, net, owner_share (third-party money, never MyBakuriani's
-- taxable income), platform_revenue (own service income), other_income (own
-- non-service income) and taxable = platform_revenue + other_income.
CREATE OR REPLACE FUNCTION public.finance_monthly_totals(p_from_month date, p_to_month date)
RETURNS TABLE (
  month date,
  received numeric,
  refunds numeric,
  adjustments numeric,
  net numeric,
  owner_share numeric,
  platform_revenue numeric,
  other_income numeric,
  taxable numeric
)
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  WITH bounds AS (
    SELECT date_trunc('month', p_from_month)::date AS first_month,
           date_trunc('month', p_to_month)::date AS last_month
  ),
  months AS (
    SELECT generate_series(b.first_month, b.last_month, interval '1 month')::date AS month
    FROM bounds b
  ),
  moves AS (
    SELECT date_trunc('month', l.occurred_at AT TIME ZONE 'Asia/Tbilisi')::date AS month,
           l.flow, l.amount, l.owner_amount, l.revenue_type
    FROM public.finance_ledger_v l, bounds b
    WHERE l.occurred_at >= (b.first_month::timestamp AT TIME ZONE 'Asia/Tbilisi')
      AND l.occurred_at < ((b.last_month + interval '1 month')::timestamp AT TIME ZONE 'Asia/Tbilisi')
  )
  SELECT
    m.month,
    coalesce(sum(mv.amount) FILTER (WHERE mv.flow = 'income'), 0),
    coalesce(-sum(mv.amount) FILTER (WHERE mv.flow = 'refund'), 0),
    coalesce(sum(mv.amount) FILTER (WHERE mv.flow = 'adjustment'), 0),
    coalesce(sum(mv.amount), 0),
    coalesce(sum(mv.owner_amount), 0),
    coalesce(sum(mv.amount - mv.owner_amount) FILTER (WHERE mv.revenue_type IS DISTINCT FROM 'other_income'), 0),
    coalesce(sum(mv.amount - mv.owner_amount) FILTER (WHERE mv.revenue_type = 'other_income'), 0),
    coalesce(sum(mv.amount - mv.owner_amount), 0)
  FROM months m
  LEFT JOIN moves mv ON mv.month = m.month
  GROUP BY m.month
  ORDER BY m.month
$$;

-- A calendar year with the small-business estimate (Tax Code art. 90): the
-- base rate until the month in which the year's taxable income passes the
-- threshold; from the start of that month to year end, the higher rate.
-- Informational only — not an RS declaration.
CREATE OR REPLACE FUNCTION public.finance_tax_year(p_year integer)
RETURNS TABLE (
  month date,
  received numeric,
  refunds numeric,
  adjustments numeric,
  net numeric,
  owner_share numeric,
  platform_revenue numeric,
  other_income numeric,
  taxable numeric,
  cumulative_taxable numeric,
  rate numeric,
  estimated_tax numeric
)
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  WITH s AS (
    SELECT fs.small_business_rate, fs.small_business_high_rate, fs.small_business_threshold
    FROM public.finance_settings fs
    WHERE fs.id
  ),
  m AS (
    SELECT * FROM public.finance_monthly_totals(make_date(p_year, 1, 1), make_date(p_year, 12, 1))
  ),
  c AS (
    SELECT m.*, sum(m.taxable) OVER (ORDER BY m.month) AS cumulative_taxable
    FROM m
  ),
  x AS (
    SELECT c.*,
           bool_or(c.cumulative_taxable > s.small_business_threshold) OVER (ORDER BY c.month) AS crossed,
           s.small_business_rate, s.small_business_high_rate
    FROM c, s
  )
  SELECT
    x.month, x.received, x.refunds, x.adjustments, x.net, x.owner_share,
    x.platform_revenue, x.other_income, x.taxable, x.cumulative_taxable,
    CASE WHEN x.crossed THEN x.small_business_high_rate ELSE x.small_business_rate END,
    round(x.taxable * CASE WHEN x.crossed THEN x.small_business_high_rate ELSE x.small_business_rate END / 100, 2)
  FROM x
  ORDER BY x.month
$$;

-- VAT watch (Tax Code art. 165): the 12 calendar months ending with the
-- month of p_as_of. Turnover = taxable (own income), a conservative stand-in
-- for "VAT-taxable operations"; the accountant makes the final call.
CREATE OR REPLACE FUNCTION public.finance_vat_window(p_as_of date)
RETURNS TABLE (
  window_start date,
  window_end date,
  turnover numeric,
  threshold numeric,
  registered boolean,
  rate numeric
)
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT
    (date_trunc('month', p_as_of) - interval '11 months')::date,
    p_as_of,
    (SELECT coalesce(sum(t.taxable), 0)
     FROM public.finance_monthly_totals(
       (date_trunc('month', p_as_of) - interval '11 months')::date,
       date_trunc('month', p_as_of)::date
     ) t),
    fs.vat_threshold,
    fs.vat_registered,
    fs.vat_rate
  FROM public.finance_settings fs
  WHERE fs.id
$$;

-- Wallet spending by revenue type (management view; never part of the cash
-- totals). Purchases use platform_revenue()'s gross list (C26).
CREATE OR REPLACE FUNCTION public.finance_wallet_usage(p_from timestamptz, p_to timestamptz)
RETURNS TABLE (
  revenue_type text,
  purchases numeric,
  refunds numeric,
  net numeric,
  purchase_count bigint
)
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT
    public.finance_transaction_revenue_type(t.type, t.reference_id),
    coalesce(sum(abs(t.amount)) FILTER (WHERE t.type <> 'membership_refund'), 0),
    coalesce(sum(abs(t.amount)) FILTER (WHERE t.type = 'membership_refund'), 0),
    coalesce(sum(abs(t.amount)) FILTER (WHERE t.type <> 'membership_refund'), 0)
      - coalesce(sum(abs(t.amount)) FILTER (WHERE t.type = 'membership_refund'), 0),
    count(*) FILTER (WHERE t.type <> 'membership_refund')
  FROM public.transactions t
  WHERE t.type IN ('vip_boost', 'super_vip', 'discount_badge', 'sms_package', 'commission', 'membership_refund')
    AND (p_from IS NULL OR t.created_at >= p_from)
    AND (p_to IS NULL OR t.created_at < p_to)
  GROUP BY 1
  ORDER BY 1
$$;

-- Wallet reconciliation: the transactions ledger against stored balances,
-- and how much wallet credit came from card payments versus elsewhere
-- (admin bonuses, test credits: no money behind them).
CREATE OR REPLACE FUNCTION public.finance_wallet_reconciliation()
RETURNS TABLE (
  ledger_total numeric,
  balances_total numeric,
  difference numeric,
  mismatched_wallets bigint,
  card_credits numeric,
  other_credits numeric
)
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  WITH per_user AS (
    SELECT t.user_id, sum(t.amount) AS ledger
    FROM public.transactions t
    GROUP BY t.user_id
  )
  SELECT
    (SELECT coalesce(sum(t.amount), 0) FROM public.transactions t),
    (SELECT coalesce(sum(b.amount), 0) FROM public.balances b),
    (SELECT coalesce(sum(b.amount), 0) FROM public.balances b)
      - (SELECT coalesce(sum(t.amount), 0) FROM public.transactions t),
    (SELECT count(*)
     FROM public.balances b
     FULL JOIN per_user u ON u.user_id = b.user_id
     WHERE coalesce(b.amount, 0) <> coalesce(u.ledger, 0)),
    (SELECT coalesce(sum(t.amount), 0) FROM public.transactions t
     WHERE t.type = 'topup' AND EXISTS (
       SELECT 1 FROM public.payments p WHERE p.id = t.reference_id AND p.provider = 'keepz')),
    (SELECT coalesce(sum(t.amount), 0) FROM public.transactions t
     WHERE t.type = 'topup' AND NOT EXISTS (
       SELECT 1 FROM public.payments p WHERE p.id = t.reference_id AND p.provider = 'keepz'))
$$;

-- ===========================================================================
-- Contract snapshot for scripts/check-db-contracts.mjs (C42)
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.finance_contract_snapshot()
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO ''
AS $function$
  WITH tables AS (
    SELECT c.oid, c.relname, c.relkind, c.relrowsecurity, c.relacl, c.relowner
    FROM pg_catalog.pg_class c
    WHERE c.oid IN (
      'public.finance_settings'::regclass,
      'public.finance_entries'::regclass,
      'public.finance_expenses'::regclass,
      'public.finance_documents'::regclass,
      'public.invoices'::regclass,
      'public.invoice_counters'::regclass,
      'public.invoice_templates'::regclass,
      'public.finance_payments_v'::regclass,
      'public.finance_refunds_v'::regclass,
      'public.finance_ledger_v'::regclass,
      'public.finance_invoices_v'::regclass
    )
  ),
  grants AS (
    SELECT t.relname AS table_name,
           CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE r.rolname END AS grantee,
           a.privilege_type AS privilege
    FROM tables t
    CROSS JOIN LATERAL aclexplode(coalesce(t.relacl, acldefault('r', t.relowner))) a
    LEFT JOIN pg_catalog.pg_roles r ON r.oid = a.grantee
    WHERE a.grantee = 0 OR r.rolname IN ('anon', 'authenticated')
  )
  SELECT jsonb_build_object(
    'bucket', (
      SELECT jsonb_build_object(
        'public', b.public,
        'file_size_limit', b.file_size_limit,
        'allowed_mime_types', to_jsonb(b.allowed_mime_types)
      )
      FROM storage.buckets b
      WHERE b.id = 'finance-documents'
    ),
    'policies_mentioning_bucket', coalesce((
      SELECT jsonb_agg(p.policyname::text ORDER BY p.policyname)
      FROM pg_catalog.pg_policies p
      WHERE p.schemaname = 'storage' AND p.tablename = 'objects'
        AND (coalesce(p.qual, '') || ' ' || coalesce(p.with_check, '')) LIKE '%finance-documents%'
    ), '[]'::jsonb),
    'client_grants', coalesce((
      SELECT jsonb_agg(
        jsonb_build_object('table', g.table_name, 'grantee', g.grantee, 'privilege', g.privilege)
        ORDER BY g.table_name, g.grantee, g.privilege
      )
      FROM grants g
    ), '[]'::jsonb),
    'rls', (
      SELECT jsonb_object_agg(t.relname, t.relrowsecurity) FROM tables t WHERE t.relkind = 'r'
    ),
    'checks', (
      SELECT jsonb_object_agg(con.conname, pg_get_constraintdef(con.oid))
      FROM pg_catalog.pg_constraint con
      WHERE con.conrelid IN (SELECT t.oid FROM tables t)
        AND con.contype = 'c'
    ),
    'triggers', coalesce((
      SELECT jsonb_object_agg(tg.tgrelid::regclass::text || '.' || tg.tgname, tg.tgenabled::text)
      FROM pg_catalog.pg_trigger tg
      WHERE NOT tg.tgisinternal
        AND tg.tgrelid IN (SELECT t.oid FROM tables t)
    ), '{}'::jsonb),
    'client_function_grants', coalesce((
      SELECT jsonb_agg(DISTINCT p.proname::text)
      FROM pg_catalog.pg_proc p
      JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
      CROSS JOIN LATERAL aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
      LEFT JOIN pg_catalog.pg_roles r ON r.oid = a.grantee
      WHERE n.nspname = 'public'
        AND (p.proname LIKE 'finance\_%' OR p.proname = 'invoices_guard')
        AND a.privilege_type = 'EXECUTE'
        AND (a.grantee = 0 OR r.rolname IN ('anon', 'authenticated'))
    ), '[]'::jsonb)
  )
$function$;

-- ===========================================================================
-- Grants: views and functions are service_role only (C34)
-- ===========================================================================

REVOKE ALL ON public.finance_payments_v FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.finance_refunds_v FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.finance_ledger_v FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.finance_invoices_v FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.finance_payments_v TO service_role;
GRANT SELECT ON public.finance_refunds_v TO service_role;
GRANT SELECT ON public.finance_ledger_v TO service_role;
GRANT SELECT ON public.finance_invoices_v TO service_role;

REVOKE ALL ON FUNCTION public.finance_forbid_delete() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.finance_entries_guard() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.finance_expenses_guard() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.finance_documents_guard() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.invoices_guard() FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.finance_try_uuid(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.finance_package_revenue_type(text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.finance_intent_revenue_type(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.finance_transaction_revenue_type(public.transaction_type, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.finance_invoice_totals(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.finance_check_invoice_room(uuid, numeric) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.finance_owner_payables() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.finance_issue_invoice(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.finance_cancel_invoice(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.finance_mark_invoice_sent(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.finance_monthly_totals(date, date) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.finance_tax_year(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.finance_vat_window(date) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.finance_wallet_usage(timestamptz, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.finance_wallet_reconciliation() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.finance_contract_snapshot() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.finance_try_uuid(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.finance_package_revenue_type(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.finance_intent_revenue_type(jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.finance_transaction_revenue_type(public.transaction_type, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.finance_invoice_totals(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.finance_check_invoice_room(uuid, numeric) TO service_role;
GRANT EXECUTE ON FUNCTION public.finance_owner_payables() TO service_role;
GRANT EXECUTE ON FUNCTION public.finance_issue_invoice(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.finance_cancel_invoice(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.finance_mark_invoice_sent(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.finance_monthly_totals(date, date) TO service_role;
GRANT EXECUTE ON FUNCTION public.finance_tax_year(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.finance_vat_window(date) TO service_role;
GRANT EXECUTE ON FUNCTION public.finance_wallet_usage(timestamptz, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.finance_wallet_reconciliation() TO service_role;
GRANT EXECUTE ON FUNCTION public.finance_contract_snapshot() TO service_role;

NOTIFY pgrst, 'reload schema';
