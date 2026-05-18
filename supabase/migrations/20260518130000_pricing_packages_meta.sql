-- Extend pricing_packages with description + meta so the admin can fully
-- describe a package (long-form text shown on user cards, plus structured
-- per-category data like sms_count or duration_hours) and so the unified
-- purchase RPC can determine behavior from the row itself.

ALTER TABLE public.pricing_packages
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS meta jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Backfill meta for the seeded rows so existing packages keep working when
-- the unified purchase RPC ships.
UPDATE public.pricing_packages
SET meta = jsonb_build_object('sms_count', 50)
WHERE category = 'sms' AND code = 'starter' AND (meta ->> 'sms_count') IS NULL;

UPDATE public.pricing_packages
SET meta = jsonb_build_object('sms_count', 100)
WHERE category = 'sms' AND code = 'standard' AND (meta ->> 'sms_count') IS NULL;

UPDATE public.pricing_packages
SET meta = jsonb_build_object('sms_count', 250)
WHERE category = 'sms' AND code = 'pro' AND (meta ->> 'sms_count') IS NULL;

UPDATE public.pricing_packages
SET meta = jsonb_build_object('duration_hours', 24, 'tier', 'super')
WHERE category = 'vip' AND code = 'vip24' AND (meta ->> 'duration_hours') IS NULL;

-- Seed packages that previously existed only as hardcoded options in the
-- user-facing balance / SMS pages, so users don't lose access to them once
-- those pages switch to reading from this table. Admins can disable them
-- via the existing is_enabled toggle if they want to remove an option.
INSERT INTO public.pricing_packages (category, code, name, label, amount_gel, sort_order, meta)
VALUES
  ('vip', 'boost', 'VIP სტატუსი', 'დღეში', 1.5, 20,
    jsonb_build_object('duration_hours', 24, 'tier', 'standard')),
  ('vip', 'discount', 'ფასდაკლების ბეჯი', 'დღეში', 1.0, 30,
    jsonb_build_object('duration_hours', 24, 'tier', 'discount')),
  ('sms', 'pack200', 'SMS პაკეტი', '200 SMS', 10, 5,
    jsonb_build_object('sms_count', 200))
ON CONFLICT (category, code) DO NOTHING;
