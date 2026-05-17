CREATE TABLE IF NOT EXISTS public.ads (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  title text NOT NULL,
  position text NOT NULL,
  url text NOT NULL,
  banner_url text,
  start_at timestamp with time zone NOT NULL,
  end_at timestamp with time zone NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','expired')),
  views_count integer NOT NULL DEFAULT 0,
  clicks_count integer NOT NULL DEFAULT 0,
  created_by uuid REFERENCES public.profiles(id),
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ads_status_idx ON public.ads (status, start_at, end_at);

ALTER TABLE public.ads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ads admin all" ON public.ads;
CREATE POLICY "ads admin all" ON public.ads
  FOR ALL
  TO authenticated
  USING (public.is_admin_user())
  WITH CHECK (public.is_admin_user());

DROP POLICY IF EXISTS "ads public read active" ON public.ads;
CREATE POLICY "ads public read active" ON public.ads
  FOR SELECT
  USING (status = 'active' AND start_at <= now() AND end_at >= now());

CREATE TABLE IF NOT EXISTS public.broadcasts (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  channel text NOT NULL CHECK (channel IN ('push','sms','email')),
  audience_filter text NOT NULL,
  subject text,
  body text NOT NULL,
  recipient_count integer NOT NULL DEFAULT 0,
  sent_at timestamp with time zone NOT NULL DEFAULT now(),
  sent_by uuid REFERENCES public.profiles(id)
);

CREATE INDEX IF NOT EXISTS broadcasts_sent_at_idx ON public.broadcasts (sent_at DESC);

ALTER TABLE public.broadcasts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "broadcasts admin all" ON public.broadcasts;
CREATE POLICY "broadcasts admin all" ON public.broadcasts
  FOR ALL
  TO authenticated
  USING (public.is_admin_user())
  WITH CHECK (public.is_admin_user());
