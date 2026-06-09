-- Arming flag for the 48h "VIP expiring" warning. Set when the warning fires;
-- reset to NULL whenever vip_expires_at is (re)set in the purchase RPCs so a
-- renewal re-arms the warning for the next cycle. Keeps the vip-lifecycle job
-- idempotent without a separate ledger table.

ALTER TABLE public.properties
  ADD COLUMN IF NOT EXISTS vip_expiry_notified_at TIMESTAMPTZ;

ALTER TABLE public.services
  ADD COLUMN IF NOT EXISTS vip_expiry_notified_at TIMESTAMPTZ;
