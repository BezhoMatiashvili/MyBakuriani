-- The "our Facebook group VIP member" seasonal-membership tier (2026 price
-- list, 20260925134000) is self-declared: the buyer ticks a checkbox and pays
-- 30 ₾ instead of 60 ₾, and an admin verifies it in the approval queue. The
-- admin had nothing to check the claim against — add the buyer's own
-- Facebook profile link so /dashboard/admin/memberships can open it.
--
-- purchase_renter_membership gets a 3rd parameter. CREATE OR REPLACE would
-- overload the existing (uuid, uuid) signature instead of replacing it, and
-- PostgREST's named-arg RPC call would then be ambiguous (PGRST203) — the old
-- signature must be dropped first. Body restated verbatim from 20260925134000
-- (live md5 verified: a0c6b36f49cbb8c42cbe952d45311361) with only the
-- fb_profile_url validation/storage added.
--
-- Only the fb_group_vip tier stores a value; a standard-tier purchase ignores
-- whatever the client sends. The https-only CHECK constraint mirrors the RPC
-- guard so no other insert path can ever store a javascript:/data: URL that
-- the admin page later renders as a clickable href.

ALTER TABLE public.user_subscriptions
  ADD COLUMN IF NOT EXISTS fb_profile_url text
    CHECK (
      fb_profile_url IS NULL
      OR (char_length(fb_profile_url) <= 300 AND fb_profile_url ~* '^https://')
    );

DROP FUNCTION IF EXISTS public.purchase_renter_membership(uuid, uuid);

CREATE FUNCTION public.purchase_renter_membership(
  p_user_id uuid,
  p_package_id uuid,
  p_fb_profile_url text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  v_pkg record;
  v_balance numeric;
  v_new_balance numeric;
  v_window_start timestamptz;
  v_expires_at timestamptz;
  v_fb_profile_url text;
  v_subscription_id uuid;
  v_transaction_id uuid;
BEGIN
  IF p_user_id IS NULL OR p_package_id IS NULL THEN
    RAISE EXCEPTION 'MEMBERSHIP_ARGUMENTS_REQUIRED' USING ERRCODE = '22023';
  END IF;

  -- One lock covers duplicate clicks and concurrent requests using different
  -- packages. The balance lock alone cannot express that cross-package rule.
  PERFORM pg_advisory_xact_lock(
    hashtextextended('renter-membership:' || p_user_id::text, 0)
  );

  SELECT id, name, amount_gel, is_enabled, meta
    INTO v_pkg
  FROM public.pricing_packages
  WHERE id = p_package_id
    AND category = 'subscription'
    AND meta ->> 'subscription_scope' = 'renter'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'MEMBERSHIP_PACKAGE_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  IF NOT v_pkg.is_enabled THEN
    RAISE EXCEPTION 'MEMBERSHIP_PACKAGE_DISABLED' USING ERRCODE = '22023';
  END IF;
  IF coalesce(v_pkg.meta ->> 'billing_period', '') <> 'seasonal' THEN
    RAISE EXCEPTION 'MEMBERSHIP_PACKAGE_NOT_SEASONAL' USING ERRCODE = '22023';
  END IF;

  -- Self-declared FB-group tier: the admin verifies the claim by opening this
  -- link, so a request without one (or with a non-https value) is rejected
  -- before it ever reaches the review queue.
  IF v_pkg.meta ->> 'price_tier' = 'fb_group_vip'
     AND coalesce(btrim(p_fb_profile_url), '') !~* '^https://' THEN
    RAISE EXCEPTION 'MEMBERSHIP_FB_PROFILE_REQUIRED' USING ERRCODE = '22023';
  END IF;
  v_fb_profile_url := CASE
    WHEN v_pkg.meta ->> 'price_tier' = 'fb_group_vip' THEN btrim(p_fb_profile_url)
    ELSE NULL
  END;

  IF EXISTS (
    SELECT 1 FROM public.user_subscriptions
    WHERE user_id = p_user_id AND status = 'pending_approval'
  ) THEN
    RAISE EXCEPTION 'MEMBERSHIP_ALREADY_PENDING' USING ERRCODE = 'P0001';
  END IF;
  -- 2026 price list: Summer (April–October) and Winter (November–March). The
  -- window is the current-or-next instance of the package's own season
  -- (Asia/Tbilisi), fixed on the pending row; review keeps it.
  BEGIN
    SELECT w.window_start, w.window_end
      INTO v_window_start, v_expires_at
    FROM public.renter_membership_season_window(
      now(),
      (v_pkg.meta ->> 'season_start_month')::integer,
      (v_pkg.meta ->> 'season_start_day')::integer,
      (v_pkg.meta ->> 'season_end_month')::integer,
      (v_pkg.meta ->> 'season_end_day')::integer
    ) w;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'MEMBERSHIP_PACKAGE_NOT_SEASONAL' USING ERRCODE = '22023';
  END;
  IF v_window_start IS NULL OR v_expires_at IS NULL THEN
    RAISE EXCEPTION 'MEMBERSHIP_PACKAGE_NOT_SEASONAL' USING ERRCODE = '22023';
  END IF;
  v_window_start := greatest(now(), v_window_start);

  -- An active membership only blocks a purchase whose remaining window it
  -- overlaps, so a summer member can pre-buy the coming winter.
  IF EXISTS (
    SELECT 1 FROM public.user_subscriptions
    WHERE user_id = p_user_id
      AND status = 'active'
      AND starts_at < v_expires_at
      AND expires_at > v_window_start
  ) THEN
    RAISE EXCEPTION 'MEMBERSHIP_ALREADY_ACTIVE' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.balances (user_id, amount, sms_remaining)
  VALUES (p_user_id, 0, 0)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT amount INTO v_balance
  FROM public.balances
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF v_balance < v_pkg.amount_gel THEN
    RAISE EXCEPTION
      'არასაკმარისი ბალანსი. საჭიროა: % ₾, ხელმისაწვდომია: % ₾',
      v_pkg.amount_gel, v_balance
      USING ERRCODE = '22023';
  END IF;

  v_new_balance := v_balance - v_pkg.amount_gel;

  INSERT INTO public.user_subscriptions (
    user_id, package_id, starts_at, expires_at, status, amount_paid, fb_profile_url
  ) VALUES (
    p_user_id, v_pkg.id, v_window_start, v_expires_at, 'pending_approval', v_pkg.amount_gel, v_fb_profile_url
  ) RETURNING id INTO v_subscription_id;

  UPDATE public.balances
  SET amount = v_new_balance, updated_at = now()
  WHERE user_id = p_user_id;

  INSERT INTO public.transactions (
    user_id, amount, type, description, reference_id
  ) VALUES (
    p_user_id,
    -v_pkg.amount_gel,
    'commission',
    format('%s (სეზონური საწევრო — ელოდება დადასტურებას)', v_pkg.name),
    v_subscription_id
  ) RETURNING id INTO v_transaction_id;

  UPDATE public.user_subscriptions
  SET payment_transaction_id = v_transaction_id
  WHERE id = v_subscription_id;

  PERFORM public._notify(
    p_user_id,
    'membership_pending',
    'საწევროს გადახდა მიღებულია',
    format('სეზონური საწევრო გადახდილია და ადმინისტრატორის დადასტურებას ელოდება. მოქმედების პერიოდი: %s – %s.',
      to_char(v_window_start AT TIME ZONE 'Asia/Tbilisi', 'YYYY-MM-DD'),
      to_char(v_expires_at AT TIME ZONE 'Asia/Tbilisi', 'YYYY-MM-DD')),
    '/dashboard/renter',
    'renter'
  );

  PERFORM public._notify_admins(
    'admin_membership_pending',
    'საწევრო ელოდება დადასტურებას',
    format('%s-ის სეზონური საწევრო გადახდილია და განხილვას ელოდება.', v_pkg.name),
    '/dashboard/admin/memberships',
    p_user_id
  );

  PERFORM public._enqueue_system_sms(
    p_user_id,
    'subscription',
    'MyBakuriani: საწევროს გადახდა მიღებულია და ადმინის დადასტურებას ელოდება.'
  );

  RETURN json_build_object(
    'subscription_id', v_subscription_id,
    'status', 'pending_approval',
    'cost', v_pkg.amount_gel,
    'new_balance', v_new_balance,
    'starts_at', v_window_start,
    'expires_at', v_expires_at
  );
END;
$fn$;

REVOKE ALL ON FUNCTION public.purchase_renter_membership(uuid, uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purchase_renter_membership(uuid, uuid, text)
  TO service_role;

NOTIFY pgrst, 'reload schema';
