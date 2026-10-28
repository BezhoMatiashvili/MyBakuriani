-- Admin "შესყიდვები" (/dashboard/admin/purchases, C42): who bought which paid
-- service from the balance, when, for how much. A purchase = one wallet debit
-- of platform_revenue()'s gross list. A card purchase is a Keepz top-up plus
-- this same debit, so payments are never added (that counts it twice).
-- refunded = that subscription's membership_refund rows at any date (purchase
-- basis; finance_wallet_usage() books refunds on their own date).
CREATE VIEW public.admin_purchases_v
WITH (security_invoker = true) AS
SELECT
  t.id,
  t.user_id,
  t.created_at,
  CASE
    WHEN t.type = 'sms_package' THEN 'sms'
    WHEN t.type = 'vip_boost' THEN 'vip'
    WHEN t.type = 'super_vip' THEN 'super_vip'
    WHEN t.type = 'discount_badge' THEN 'discount'
    WHEN us.id IS NOT NULL THEN 'membership'
    WHEN o.id IS NOT NULL THEN 'company_plan'
    WHEN pp.category = 'subscription' AND pp.code LIKE 'company-%' THEN 'company_plan'
    WHEN pp.category = 'subscription' THEN 'membership'
    ELSE 'other'
  END AS service,
  -t.amount AS amount,
  t.description,
  CASE WHEN pr.id IS NOT NULL THEN 'property' WHEN sv.id IS NOT NULL THEN 'service' END AS listing_kind,
  coalesce(pr.id, sv.id) AS listing_id,
  coalesce(pr.title, sv.title) AS listing_title,
  coalesce(o.brand_name, o.legal_name) AS organization_name,
  CASE
    WHEN us.status = 'active' AND us.expires_at <= now() THEN 'expired'
    WHEN us.status = 'active' AND us.starts_at > now() THEN 'upcoming'
    ELSE us.status
  END AS membership_status,
  coalesce(rf.refunded, 0) AS refunded
FROM public.transactions t
-- Food discounts approved through a change request (C21; history only).
LEFT JOIN public.content_change_requests ccr
  ON t.type = 'discount_badge' AND ccr.id = t.reference_id AND ccr.target_type = 'service'
LEFT JOIN public.properties pr
  ON t.type IN ('vip_boost', 'super_vip', 'discount_badge') AND pr.id = t.reference_id
LEFT JOIN public.services sv
  ON t.type IN ('vip_boost', 'super_vip', 'discount_badge') AND sv.id = coalesce(ccr.target_id, t.reference_id)
LEFT JOIN public.user_subscriptions us ON t.type = 'commission' AND us.id = t.reference_id
LEFT JOIN public.organizations o ON t.type = 'commission' AND o.id = t.reference_id
LEFT JOIN public.pricing_packages pp ON t.type = 'commission' AND pp.id = t.reference_id
LEFT JOIN (
  -- abs() as in finance_wallet_usage(): a refund counts by its size.
  SELECT r.reference_id, sum(abs(r.amount)) AS refunded
  FROM public.transactions r
  WHERE r.type = 'membership_refund'
  GROUP BY r.reference_id
) rf ON rf.reference_id = us.id
WHERE t.type IN ('vip_boost', 'super_vip', 'discount_badge', 'sms_package', 'commission')
  AND t.amount < 0;

CREATE OR REPLACE FUNCTION public.admin_purchases_report(
  p_from timestamptz DEFAULT NULL,
  p_to timestamptz DEFAULT NULL,
  p_service text DEFAULT NULL,
  p_search text DEFAULT NULL,
  p_page integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $$
DECLARE
  c_page_size constant integer := 50;
  c_top constant integer := 20;
  v_name text := lower(nullif(btrim(p_search), ''));
  v_digits text := regexp_replace(coalesce(p_search, ''), '\D', '', 'g');
BEGIN
  IF p_service IS NOT NULL
     AND p_service NOT IN ('sms', 'vip', 'super_vip', 'discount', 'membership', 'company_plan', 'other') THEN
    RAISE EXCEPTION 'invalid purchase service %', p_service USING ERRCODE = '22023';
  END IF;
  IF p_page IS NULL OR p_page NOT BETWEEN 0 AND 1000 THEN
    RAISE EXCEPTION 'invalid page %', p_page USING ERRCODE = '22023';
  END IF;

  RETURN (
    WITH base AS (          -- window + search; summary and totals use all services
      SELECT v.*, pf.display_name, pf.phone
      FROM public.admin_purchases_v v
      LEFT JOIN public.profiles pf ON pf.id = v.user_id
      WHERE (p_from IS NULL OR v.created_at >= p_from)
        AND (p_to IS NULL OR v.created_at < p_to)
        AND (v_name IS NULL
          OR strpos(lower(coalesce(pf.display_name, '')), v_name) > 0
          OR (length(v_digits) >= 3
              AND strpos(regexp_replace(coalesce(pf.phone, ''), '\D', '', 'g'), v_digits) > 0))
    ),
    picked AS (SELECT * FROM base WHERE p_service IS NULL OR service = p_service),
    customers AS (
      SELECT user_id, display_name, phone, count(*) AS purchases,
        sum(amount) AS gross, sum(refunded) AS refunded,
        array_agg(DISTINCT service ORDER BY service) AS services, max(created_at) AS last_at
      FROM picked
      GROUP BY user_id, display_name, phone
      ORDER BY sum(amount) - sum(refunded) DESC, max(created_at) DESC
      LIMIT c_top
    )
    SELECT jsonb_build_object(
      'page_size', c_page_size,
      'total_rows', (SELECT count(*) FROM picked),
      'summary', (SELECT jsonb_build_object('purchases', count(*), 'buyers', count(DISTINCT user_id),
          'gross', coalesce(sum(amount), 0), 'refunded', coalesce(sum(refunded), 0),
          'net', coalesce(sum(amount) - sum(refunded), 0)) FROM base),
      'totals', coalesce((SELECT jsonb_agg(jsonb_build_object('service', s.service,
          'purchases', s.purchases, 'buyers', s.buyers, 'gross', s.gross,
          'refunded', s.refunded, 'net', s.gross - s.refunded) ORDER BY s.gross DESC, s.service)
        FROM (SELECT service, count(*) AS purchases, count(DISTINCT user_id) AS buyers,
                     sum(amount) AS gross, sum(refunded) AS refunded
              FROM base GROUP BY service) s), '[]'::jsonb),
      'customers', coalesce((SELECT jsonb_agg(jsonb_build_object('id', c.user_id,
          'name', c.display_name, 'phone', c.phone, 'purchases', c.purchases, 'gross', c.gross,
          'refunded', c.refunded, 'net', c.gross - c.refunded, 'services', to_jsonb(c.services),
          'last_at', c.last_at)
          ORDER BY c.gross - c.refunded DESC, c.last_at DESC)
        FROM customers c), '[]'::jsonb),
      'rows', coalesce((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.created_at DESC, r.id)
        FROM (SELECT p.id, p.created_at, p.user_id AS customer_id, p.display_name AS name,
                     p.phone, p.service, p.amount, p.description, p.listing_kind, p.listing_id,
                     p.listing_title, p.organization_name, p.membership_status, p.refunded
              FROM picked p ORDER BY p.created_at DESC, p.id
              LIMIT c_page_size OFFSET p_page * c_page_size) r), '[]'::jsonb)
    )
  );
END;
$$;

REVOKE ALL ON public.admin_purchases_v FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.admin_purchases_v TO service_role;
REVOKE ALL ON FUNCTION public.admin_purchases_report(timestamptz, timestamptz, text, text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_purchases_report(timestamptz, timestamptz, text, text, integer) TO service_role;
NOTIFY pgrst, 'reload schema';
