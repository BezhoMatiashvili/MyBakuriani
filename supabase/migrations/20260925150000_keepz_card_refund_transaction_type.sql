-- Keepz card refunds (C32): the wallet debit taken when an admin refunds a card
-- payment, and its reversal if Keepz reports the refund failed.
--
-- Its own migration on purpose: a new enum label cannot be used in the same
-- transaction that adds it (55P04), and 20260925150100 uses it. PostgREST caches
-- enum labels, hence the reload. Like every enum change, this must be followed
-- by a types regen (C3) or `npm run check:db-contracts` fails (C29).
--
-- Not revenue: platform_revenue() is an allow-list of debit types and does not
-- include card_refund (C26) — a refund returns wallet credit, it never touches
-- earned revenue.

ALTER TYPE public.transaction_type ADD VALUE IF NOT EXISTS 'card_refund';

NOTIFY pgrst, 'reload schema';
