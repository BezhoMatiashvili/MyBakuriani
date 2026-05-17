ALTER TABLE public.calendar_blocks
  ADD COLUMN IF NOT EXISTS manual_price NUMERIC(10,2);
COMMENT ON COLUMN public.calendar_blocks.manual_price IS 'Per-day owner-set price override; if NULL, falls back to property.price_per_night.';
