-- 2026 price list — MyBakuriani_ფასების_ცხრილი_და_განმარტებები_2026.docx (sections 2, 4, 5).
--
-- Absolute target values keyed on (category, code), so every environment converges
-- regardless of earlier admin edits (staging and prod had drifted in different
-- directions). Codes never change: e2e looks rows up by `boost` / `vip24`, and the
-- company purchase RPC derives `company-<tier>`. Rows the doc does not list are
-- DISABLED, never deleted (user_subscriptions / transactions may reference them).
--
--   VIP services (all 24 h):  VIP სტატუსი 1.50 ₾ · ფასდაკლების ბეიჯი 2.50 ₾ · SUPER VIP 5 ₾
--   SMS packages:             SMS პაკეტი 100 SMS 10 ₾ · Standard SMS 200 SMS 20 ₾ · Pro SMS 250 SMS 25 ₾
--   Developer packages:       START 100 ₾ (≤10) · PRO 200 ₾ (≤50) · PREMIUM 350 ₾ (unlimited)
--                             (PREMIUM+ 500 ₾ is added with its tier in 20260925133000.)
--
-- VIP descriptions are the doc's own paragraphs 2.1–2.3. VIP sort orders are unchanged.
-- NOTE (C21): the vip/discount row also prices the self-service per-dish food
-- discount, which therefore becomes 2.50 ₾ / dish / 24 h.
-- Data only: no function, policy or grant changes. The purchase RPCs read amount_gel,
-- meta.duration_hours and meta.sms_count at purchase time.

INSERT INTO public.pricing_packages
  (category, code, name, label, amount_gel, is_enabled, sort_order, description, meta)
VALUES
  ('vip', 'vip24', 'SUPER VIP', '24 საათი', 5, true, 10, 'SUPER VIP არის განცხადების ხილვადობის უმაღლესი პაკეტი. აქტივაციის პერიოდში განცხადება იღებს პრიორიტეტულ პოზიციონირებას, გამოჩნდება ძიების პრიორიტეტულ შედეგებში და მთავარი გვერდის SUPER VIP სექციაში.', '{"tier": "super", "duration_hours": 24}'::jsonb),
  ('vip', 'boost', 'VIP სტატუსი', '24 საათი', 1.50, true, 20, 'VIP სტატუსი განცხადებას ანიჭებს სპეციალურ VIP ბეიჯს და უზრუნველყოფს მის უფრო თვალსაჩინო წარმოჩენას პლატფორმაზე იმ ადგილებში, სადაც VIP განცხადებებია წარმოდგენილი.', '{"tier": "standard", "duration_hours": 24}'::jsonb),
  ('vip', 'discount', 'ფასდაკლების ბეიჯი', '24 საათი', 2.50, true, 30, 'ფასდაკლების ბეიჯი განცხადებას ანიჭებს სპეციალურ ნიშნულს, რომელიც მომხმარებელს აჩვენებს, რომ შეთავაზებაზე მოქმედებს ფასდაკლება ან სპეციალური პირობა. განცხადება შეიძლება გამოჩნდეს „სპეციალური შეთავაზებების“ შესაბამის სექციაში/ფილტრში.', '{"tier": "discount", "duration_hours": 24}'::jsonb),
  ('sms', 'standard', 'SMS პაკეტი', '100 SMS', 10, true, 10, NULL, '{"sms_count": 100}'::jsonb),
  ('sms', 'pack200', 'Standard SMS', '200 SMS', 20, true, 20, NULL, '{"sms_count": 200}'::jsonb),
  ('sms', 'pro', 'Pro SMS', '250 SMS', 25, true, 30, NULL, '{"sms_count": 250}'::jsonb),
  ('subscription', 'company-entry', 'START', '10 ბინამდე', 100, true, 40, NULL, '{"listing_limit": 10, "subscription_scope": "organization"}'::jsonb),
  ('subscription', 'company-pro', 'PRO', '50 ბინამდე', 200, true, 50, NULL, '{"listing_limit": 50, "subscription_scope": "organization"}'::jsonb),
  ('subscription', 'company-premium', 'PREMIUM', 'ულიმიტო ბინა', 350, true, 60, NULL, '{"listing_limit": null, "subscription_scope": "organization"}'::jsonb)
ON CONFLICT (category, code) DO UPDATE SET
  name        = EXCLUDED.name,
  label       = EXCLUDED.label,
  amount_gel  = EXCLUDED.amount_gel,
  is_enabled  = EXCLUDED.is_enabled,
  sort_order  = EXCLUDED.sort_order,
  description = EXCLUDED.description,
  meta        = EXCLUDED.meta,
  updated_at  = now();

-- Not in the 2026 price list: the 50-SMS starter pack and the stale 25 ₾
-- "Developer Pro" subscription row (unpurchasable since 20260905121000, but still
-- listed in admin settings). Disabled, not deleted.
UPDATE public.pricing_packages
SET is_enabled = false,
    updated_at = now()
WHERE (category, code) IN (('sms', 'starter'), ('subscription', 'developer-pro'))
  AND is_enabled;
