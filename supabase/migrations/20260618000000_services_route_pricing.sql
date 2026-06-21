-- Per-route transport pricing. Additive, nullable, non-destructive.
-- Ordered jsonb array of { route, subtitle?, price, unit } so one transport
-- listing can show multiple routes, each with its own price + unit. The legacy
-- single-price columns (routes/price/price_unit) stay populated for cards,
-- filters, and the detail-page fallback. NULL/empty => use the single price.
-- Rollback: ALTER TABLE public.services DROP COLUMN IF EXISTS route_pricing;
ALTER TABLE public.services
  ADD COLUMN IF NOT EXISTS route_pricing jsonb;

COMMENT ON COLUMN public.services.route_pricing IS
  'Transport per-route pricing: ordered array of {route,subtitle?,price,unit}. NULL/empty => use price/price_unit/routes.';
