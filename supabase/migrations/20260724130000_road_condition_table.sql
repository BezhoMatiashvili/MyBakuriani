-- Live road-condition status for the "გზა თბილისიდან" landing hero badge.
-- One row per route (currently just tbilisi_bakuriani), refreshed every 30 min
-- by the road-condition-refresh edge function (Google Routes API, traffic-aware).
-- The public site reads it via src/lib/road-condition/server.ts and overlays it
-- onto the admin-managed "road" status card (same pattern as the live weather
-- card). Public read; writes come from the edge function's service-role client
-- (RLS-bypassing) or an admin.

CREATE TABLE IF NOT EXISTS public.road_conditions (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  route_slug               TEXT NOT NULL UNIQUE,
  status_code              TEXT NOT NULL DEFAULT 'unknown'
                             CHECK (status_code IN ('clear', 'moderate', 'heavy', 'unknown')),
  duration_seconds         INTEGER,   -- live, traffic-aware travel time
  static_duration_seconds  INTEGER,   -- free-flow baseline (no traffic)
  distance_meters          INTEGER,
  ratio                    DOUBLE PRECISION,  -- duration / static_duration
  computed_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  source                   TEXT NOT NULL DEFAULT 'google_routes',
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.road_conditions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "road_conditions_read_all" ON public.road_conditions;
CREATE POLICY "road_conditions_read_all" ON public.road_conditions
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "road_conditions_admin_write" ON public.road_conditions;
CREATE POLICY "road_conditions_admin_write" ON public.road_conditions
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

-- Seed the single route with an 'unknown' placeholder so the overlay has a row
-- to upsert against before the first cron run. status_code='unknown' makes the
-- display fall through to the admin/default card value, not a bare "უცნობია".
INSERT INTO public.road_conditions (route_slug, status_code)
VALUES ('tbilisi_bakuriani', 'unknown')
ON CONFLICT (route_slug) DO NOTHING;

CREATE OR REPLACE FUNCTION public.touch_road_conditions_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS road_conditions_set_updated_at ON public.road_conditions;
CREATE TRIGGER road_conditions_set_updated_at
  BEFORE UPDATE ON public.road_conditions
  FOR EACH ROW EXECUTE FUNCTION public.touch_road_conditions_updated_at();
