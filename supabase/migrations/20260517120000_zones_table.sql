-- Admin-managed location zones.
-- Replaces the hardcoded SEARCH_LOCATION_ZONES constants and centralises
-- zone definitions used by the hero search, sale search, map markers,
-- create forms, smart-match modal, and landing price-per-zone widget.

CREATE TABLE IF NOT EXISTS public.zones (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug           TEXT NOT NULL UNIQUE,
  name_ka        TEXT NOT NULL,
  description_ka TEXT NOT NULL DEFAULT '',
  lat            DOUBLE PRECISION NOT NULL,
  lng            DOUBLE PRECISION NOT NULL,
  icon           TEXT NOT NULL DEFAULT 'mountain' CHECK (icon IN ('mountain', 'tree', 'pin')),
  sort_order     INTEGER NOT NULL DEFAULT 0,
  is_active      BOOLEAN NOT NULL DEFAULT true,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS zones_active_sort_idx
  ON public.zones (is_active, sort_order);

ALTER TABLE public.zones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "zones_read_all" ON public.zones;
CREATE POLICY "zones_read_all" ON public.zones
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "zones_admin_write" ON public.zones;
CREATE POLICY "zones_admin_write" ON public.zones
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Seed the 4 existing zones with current coordinates from locations.ts.
-- These match the values previously hardcoded in SEARCH_LOCATION_ZONES /
-- ZONE_CENTERS so legacy properties (whose `location` column stores the
-- zone name as a string) continue to resolve cleanly.
INSERT INTO public.zones (slug, name_ka, description_ka, lat, lng, icon, sort_order)
VALUES
  ('didveli',  'დიდველი / კრისტალი', 'ტრასასთან ახლოს, საბაგირეს ხედვით',         41.7385, 43.5175, 'mountain', 1),
  ('centri',   'ცენტრი / პარკი',     'გართობა, რესტორნები და ცენტრალური პარკი',     41.7509, 43.5294, 'tree',     2),
  ('kokhta',   'კოხტა / მიტარბი',    'პრემიუმ ფარეხი და ახალი საბაგიროები',         41.7580, 43.5450, 'mountain', 3),
  ('25ianebi', '25-იანები',          'იაფფასიანი ბინები და დამწყებთათვის',          41.7460, 43.5380, 'pin',      4)
ON CONFLICT (slug) DO NOTHING;

CREATE OR REPLACE FUNCTION public.touch_zones_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS zones_set_updated_at ON public.zones;
CREATE TRIGGER zones_set_updated_at
  BEFORE UPDATE ON public.zones
  FOR EACH ROW EXECUTE FUNCTION public.touch_zones_updated_at();
