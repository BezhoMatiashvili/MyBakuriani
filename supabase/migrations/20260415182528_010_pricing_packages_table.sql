CREATE TABLE IF NOT EXISTS public.pricing_packages (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  category text NOT NULL CHECK (category IN ('sms','vip','verification','ad','subscription')),
  code text NOT NULL,
  name text NOT NULL,
  label text,
  amount_gel numeric NOT NULL CHECK (amount_gel >= 0),
  is_enabled boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (category, code)
);

CREATE INDEX IF NOT EXISTS pricing_packages_category_idx ON public.pricing_packages (category, sort_order);

ALTER TABLE public.pricing_packages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pricing_packages admin all" ON public.pricing_packages;
CREATE POLICY "pricing_packages admin all" ON public.pricing_packages
  FOR ALL
  TO authenticated
  USING (public.is_admin_user())
  WITH CHECK (public.is_admin_user());

DROP POLICY IF EXISTS "pricing_packages public read enabled" ON public.pricing_packages;
CREATE POLICY "pricing_packages public read enabled" ON public.pricing_packages
  FOR SELECT
  USING (is_enabled = true);

-- Seed with current hardcoded defaults from src/app/[locale]/dashboard/admin/settings/page.tsx
INSERT INTO public.pricing_packages (category, code, name, label, amount_gel, sort_order)
VALUES
  ('sms','starter','Starter SMS','50 SMS',10,10),
  ('sms','standard','Standard SMS','100 SMS',18,20),
  ('sms','pro','Pro SMS','250 SMS',40,30),
  ('vip','vip24','VIP 24 საათი',NULL,5,10),
  ('verification','fb','FB ჯგუფი',NULL,30,10),
  ('verification','standard','სტანდარტული',NULL,12,20),
  ('ad','hero','მთავარი ბანერი','1 კვირა',25,10),
  ('ad','category','კატეგორიის რეკლამა','1 კვირა',15,20),
  ('subscription','seller-basic','Seller Basic','ფიზიკური პირი / თვე',10,10),
  ('subscription','developer-pro','Developer Pro','დეველოპერი / თვე',25,20)
ON CONFLICT (category, code) DO NOTHING;
