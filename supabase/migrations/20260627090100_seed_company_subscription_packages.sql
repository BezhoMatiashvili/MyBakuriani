-- Company subscription tiers surfaced in the company admin cabinet.
-- Price is admin-editable via pricing_packages; the apartment cap lives in
-- meta.listing_limit (NULL = unlimited). The purchase_company_subscription RPC
-- reads both from here so admin price edits flow through without code changes.
INSERT INTO public.pricing_packages (category, code, name, label, amount_gel, sort_order, meta)
VALUES
  ('subscription','company-entry',   'ENTRY',   '10 ბინამდე',   100, 40, '{"listing_limit":10}'::jsonb),
  ('subscription','company-pro',     'PRO',     '50 ბინამდე',   200, 50, '{"listing_limit":50}'::jsonb),
  ('subscription','company-premium', 'PREMIUM', 'ულიმიტო ბინა', 350, 60, '{"listing_limit":null}'::jsonb)
ON CONFLICT (category, code) DO NOTHING;
