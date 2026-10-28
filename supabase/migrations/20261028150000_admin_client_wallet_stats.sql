-- Lifetime tiles of the admin client modal (/dashboard/admin/clients, C26/C42), one SQL
-- definition each, replacing a TypeScript sum in /api/admin/clients/[id]/transactions:
--   ltv = the client's purchases net of their own refunds, read from admin_purchases_v, so it
--         equals the customer's net on /dashboard/admin/purchases (a card purchase is a top-up
--         plus that debit, so top-ups are never added; a card refund is not spend);
--   vip_count = VIP, SUPER VIP and discount-badge rows, paid or granted ("VIP usage");
--   topup_count = wallet top-ups, by card or as a bonus.
-- Service role only; apply before the app.

CREATE OR REPLACE FUNCTION public.admin_client_wallet_stats(p_user_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'ltv', coalesce((SELECT sum(v.amount - v.refunded) FROM public.admin_purchases_v v WHERE v.user_id = p_user_id), 0),
    'vip_count', (SELECT count(*) FROM public.transactions t
                  WHERE t.user_id = p_user_id AND t.type IN ('vip_boost', 'super_vip', 'discount_badge')),
    'topup_count', (SELECT count(*) FROM public.transactions t WHERE t.user_id = p_user_id AND t.type = 'topup')
  );
$$;

REVOKE ALL ON FUNCTION public.admin_client_wallet_stats(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_client_wallet_stats(uuid) TO service_role;
NOTIFY pgrst, 'reload schema';
