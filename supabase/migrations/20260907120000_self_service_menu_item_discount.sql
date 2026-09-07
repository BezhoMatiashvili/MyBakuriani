-- Product decision (2026-09-07): restaurant owners can now activate a
-- menu-item discount themselves, without admin review -- the same
-- self-service exception already granted to cleaner working hours
-- (20260801120000) and profile identity fields (20260905122000). The paid
-- mechanics (pricing-package quote, balance charge, discount window) are
-- unchanged; only the admin-approval step is removed.
--
-- submit_menu_item_discount_request / approve_menu_item_discount_request /
-- guard_food_discount_approval are left in place untouched, matching how
-- 20260816120000 itself retired the older flat-listing food_discount RPCs:
-- kept for any historical content_change_requests row, unreachable because
-- the app no longer calls them.

CREATE OR REPLACE FUNCTION public.self_service_activate_menu_item_discount(
  p_actor_id uuid,
  p_menu_item_id uuid,
  p_package_id uuid,
  p_discount_percent integer,
  p_quantity integer DEFAULT 1
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE
  v_item public.service_menu_items%ROWTYPE;
  v_service public.services%ROWTYPE;
  v_package public.pricing_packages%ROWTYPE;
  v_balance numeric := 0;
  v_duration integer;
  v_amount numeric;
  v_expires_at timestamptz;
BEGIN
  IF p_actor_id IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '42501';
  END IF;
  IF p_discount_percent IS NULL OR p_discount_percent < 1 OR p_discount_percent > 90 THEN
    RAISE EXCEPTION 'invalid_discount_percent' USING ERRCODE = '22023';
  END IF;
  IF p_quantity IS NULL OR p_quantity < 1 OR p_quantity > 365 THEN
    RAISE EXCEPTION 'invalid_quantity' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_item FROM public.service_menu_items
  WHERE id = p_menu_item_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'menu_item_not_found' USING ERRCODE = 'P0002'; END IF;

  SELECT * INTO v_service FROM public.services
  WHERE id = v_item.service_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'menu_item_not_found' USING ERRCODE = 'P0002'; END IF;
  IF v_service.owner_id <> p_actor_id THEN
    RAISE EXCEPTION 'service_forbidden' USING ERRCODE = '42501';
  END IF;
  IF v_service.category <> 'food' OR v_service.status <> 'active' THEN
    RAISE EXCEPTION 'active_food_service_required' USING ERRCODE = '22023';
  END IF;
  IF NOT v_item.is_available THEN
    RAISE EXCEPTION 'menu_item_unavailable' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_package FROM public.pricing_packages
  WHERE id = p_package_id FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'package_not_found' USING ERRCODE = 'P0002'; END IF;
  IF NOT v_package.is_enabled
     OR v_package.category <> 'vip'
     OR coalesce(v_package.meta ->> 'tier', '') <> 'discount' THEN
    RAISE EXCEPTION 'discount_package_required' USING ERRCODE = '22023';
  END IF;
  v_duration := coalesce(nullif(v_package.meta ->> 'duration_hours', '')::integer, 24) * p_quantity;
  IF v_duration < 1 OR v_duration > 8760 THEN
    RAISE EXCEPTION 'invalid_package_duration' USING ERRCODE = '22023';
  END IF;
  v_amount := v_package.amount_gel * p_quantity;

  INSERT INTO public.balances(user_id, amount, sms_remaining)
  VALUES (p_actor_id, 0, 0) ON CONFLICT (user_id) DO NOTHING;
  SELECT amount INTO v_balance FROM public.balances
  WHERE user_id = p_actor_id FOR UPDATE;
  IF v_balance < v_amount THEN
    RAISE EXCEPTION 'insufficient_balance' USING ERRCODE = '22023';
  END IF;

  v_expires_at := now() + make_interval(hours => v_duration);
  UPDATE public.balances
  SET amount = amount - v_amount, updated_at = now()
  WHERE user_id = p_actor_id;
  UPDATE public.service_menu_items
  SET discount_percent = p_discount_percent,
      discount_expires_at = v_expires_at,
      updated_at = now()
  WHERE id = v_item.id;
  INSERT INTO public.transactions(user_id, amount, type, description, reference_id)
  VALUES (
    p_actor_id,
    -v_amount,
    'discount_badge',
    format('კერძის ფასდაკლება: %s — %s%% (%s სთ)', v_item.name, p_discount_percent, v_duration),
    v_service.id
  );
  INSERT INTO public.notifications(user_id,type,title,message,action_url,dashboard_scope)
  VALUES (p_actor_id,'content_change_approved','კერძის ფასდაკლება გააქტიურდა',
    format('%s — %s%% ფასდაკლება გააქტიურდა %s საათით.', v_item.name, p_discount_percent, v_duration),
    '/dashboard/food/orders','food');

  RETURN jsonb_build_object(
    'status', 'approved',
    'menu_item_id', v_item.id,
    'discount_percent', p_discount_percent,
    'discount_expires_at', v_expires_at,
    'charged', v_amount
  );
END;
$$;
REVOKE ALL ON FUNCTION public.self_service_activate_menu_item_discount(uuid,uuid,uuid,integer,integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.self_service_activate_menu_item_discount(uuid,uuid,uuid,integer,integer)
  TO service_role;

-- Ship-time cutover: any 'menu_item_discount' request still awaiting admin
-- review cannot be approved through a route that no longer exists in the app
-- (the admin dispatch stays wired for historical rows, but nothing creates
-- new pending ones going forward); supersede and point the owner at the new
-- instant-activation button instead of leaving it stranded pending forever.
WITH superseded AS (
  UPDATE public.content_change_requests
  SET status = 'superseded', reviewed_at = now(),
      rejection_reason = 'menu_item_discount_now_self_service'
  WHERE status = 'pending' AND request_kind = 'menu_item_discount'
  RETURNING requester_id
)
INSERT INTO public.notifications(user_id, type, title, message, action_url, dashboard_scope)
SELECT DISTINCT requester_id, 'content_change_superseded',
  'კერძის ფასდაკლება ახლა მყისიერია',
  'ადმინის დადასტურება აღარ არის საჭირო — ფასდაკლების გააქტიურება ახლა მყისიერად ხდება მენიუს გვერდიდან.',
  '/dashboard/food/orders', 'food'
FROM superseded;

NOTIFY pgrst, 'reload schema';
