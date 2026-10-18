-- 20261005120100_finance_invoice_vat_rule.sql
--
-- Finance module (C42) follow-up. Spec §15: an invoice carries a VAT line
-- only when the tax regime calls for one. finance_issue_invoice() now refuses
-- a draft whose VAT line does not match finance_settings.vat_registered at
-- the moment of issue (FINANCE_INVOICE_VAT_MISMATCH); everything else in the
-- function is unchanged from 20261005120000 (copied, not retyped).

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
  -- Spec §15: a VAT line only when the regime calls for one. A draft saved
  -- under the other VAT status is refused until it is saved again (the API
  -- sets vat_rate from finance_settings on every save).
  IF (v_invoice.vat_rate IS NOT NULL) IS DISTINCT FROM v_settings.vat_registered THEN
    RAISE EXCEPTION 'FINANCE_INVOICE_VAT_MISMATCH' USING ERRCODE = '22023';
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

REVOKE ALL ON FUNCTION public.finance_issue_invoice(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finance_issue_invoice(uuid) TO service_role;
