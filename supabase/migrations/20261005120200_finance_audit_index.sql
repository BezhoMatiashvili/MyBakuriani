-- 20261005120200_finance_audit_index.sql
--
-- Finance module (C42) follow-up. /api/admin/finance/audit lists one finance
-- record's history (spec §14): audit_logs by table_name + record_id, newest
-- first. audit_logs had no index for that, so every history was a sequential
-- scan of the whole log (staging 2026-10-05: 11 517 rows, 215 ms, growing
-- with every audited write). Partial: only the finance tables read it.

CREATE INDEX IF NOT EXISTS audit_logs_finance_record_idx
  ON public.audit_logs (table_name, record_id, occurred_at DESC)
  WHERE table_name IN (
    'finance_entries',
    'finance_expenses',
    'finance_documents',
    'invoices',
    'invoice_templates',
    'finance_settings'
  );
