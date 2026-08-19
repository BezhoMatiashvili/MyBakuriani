-- Keep membership rejections distinguishable from wallet top-ups and revenue.
-- This lives in its own migration because a freshly-added enum value cannot be
-- used safely by functions created in the same PostgreSQL transaction.
ALTER TYPE public.transaction_type ADD VALUE IF NOT EXISTS 'membership_refund';
