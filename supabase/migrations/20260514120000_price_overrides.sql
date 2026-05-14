-- Per-day price overrides for property rentals.
-- Renters can set a custom price for any date; absence of a row means the
-- property's base price_per_night is used.

CREATE TABLE IF NOT EXISTS public.price_overrides (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  date        DATE NOT NULL,
  price       NUMERIC(10,2) NOT NULL CHECK (price >= 0),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (property_id, date)
);

CREATE INDEX IF NOT EXISTS idx_price_overrides_property_date
  ON public.price_overrides (property_id, date);

ALTER TABLE public.price_overrides ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "price_overrides_public_read" ON public.price_overrides;
CREATE POLICY "price_overrides_public_read"
  ON public.price_overrides
  FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "price_overrides_owner_insert" ON public.price_overrides;
CREATE POLICY "price_overrides_owner_insert"
  ON public.price_overrides
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.properties p
      WHERE p.id = property_id AND p.owner_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "price_overrides_owner_update" ON public.price_overrides;
CREATE POLICY "price_overrides_owner_update"
  ON public.price_overrides
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.properties p
      WHERE p.id = property_id AND p.owner_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.properties p
      WHERE p.id = property_id AND p.owner_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "price_overrides_owner_delete" ON public.price_overrides;
CREATE POLICY "price_overrides_owner_delete"
  ON public.price_overrides
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.properties p
      WHERE p.id = property_id AND p.owner_id = auth.uid()
    )
  );

-- Keep updated_at fresh
CREATE OR REPLACE FUNCTION public.touch_price_overrides_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_price_overrides_updated_at ON public.price_overrides;
CREATE TRIGGER trg_price_overrides_updated_at
  BEFORE UPDATE ON public.price_overrides
  FOR EACH ROW EXECUTE FUNCTION public.touch_price_overrides_updated_at();
