-- Narrow audit-trigger scope.
--
-- The row-audit trigger trg_audit_row (function public.audit_row_change(),
-- defined in 20260617000000_audit_logs.sql) fires AFTER INSERT/UPDATE/DELETE on
-- 34 tables. Each audited write does an extra INSERT into audit_logs inside the
-- same transaction (plus index maintenance), amplifying write cost and WAL.
--
-- Detach it from 6 high-frequency / low-forensic-value tables. Their own rows
-- are still retained; only the redundant audit-trail copy is dropped:
--   - sms_messages, sms_outbound, sms_broadcasts : machine-generated message
--     traffic (the message rows themselves are the record of truth)
--   - favorites                                   : pure add/remove toggle spam
--   - calendar_blocks, price_overrides            : high-churn operational data;
--                                                   bulk edits multiply audit rows
--
-- audit_row_change() and the other 28 audited tables are unchanged. Non-destructive
-- (no data removed). See the DOWN block at the bottom to restore.

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'sms_messages', 'sms_outbound', 'sms_broadcasts',
    'favorites', 'calendar_blocks', 'price_overrides'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_audit_row ON public.%I', t);
  END LOOP;
END $$;

-- ===========================================================================
-- DOWN (manual rollback — run this block to restore auditing on these tables):
--
-- DO $$
-- DECLARE t text;
-- BEGIN
--   FOREACH t IN ARRAY ARRAY[
--     'sms_messages', 'sms_outbound', 'sms_broadcasts',
--     'favorites', 'calendar_blocks', 'price_overrides'
--   ] LOOP
--     EXECUTE format('DROP TRIGGER IF EXISTS trg_audit_row ON public.%I', t);
--     EXECUTE format(
--       'CREATE TRIGGER trg_audit_row AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.audit_row_change()',
--       t
--     );
--   END LOOP;
-- END $$;
-- ===========================================================================
