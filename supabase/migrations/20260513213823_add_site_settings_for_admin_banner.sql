CREATE TABLE IF NOT EXISTS public.site_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by UUID REFERENCES public.profiles(id)
);

INSERT INTO public.site_settings (key, value) VALUES
  ('hero_banner', jsonb_build_object(
    'enabled', true,
    'title', 'გადამოწმებულ განცხადებებს ენიჭება ოქროს ფერი',
    'subtitle', 'აირჩიეთ სანდო მესაკუთრეები უსაფრთხო ჯავშნისთვის.',
    'cta_label', 'კიდევ ნახე',
    'cta_url', '/faq'
  ))
ON CONFLICT (key) DO NOTHING;

ALTER TABLE public.site_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "site_settings_read_all" ON public.site_settings;
CREATE POLICY "site_settings_read_all" ON public.site_settings
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "site_settings_admin_write" ON public.site_settings;
CREATE POLICY "site_settings_admin_write" ON public.site_settings
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));
