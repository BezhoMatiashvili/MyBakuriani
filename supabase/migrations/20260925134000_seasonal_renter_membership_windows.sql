-- Seasonal renter membership per the 2026 price list
-- (MyBakuriani_ფასების_ცხრილი_და_განმარტებები_2026.docx §1):
--   Summer season  April – October    · Winter season  November – March
--   30 ₾ for "our Facebook group VIP member" · 60 ₾ for every other user
--   Payment does not activate; an admin confirms (existing review flow).
--
-- Before: one package whose expiry was always "the next March 15", so a summer
-- buyer was covered all winter and an active member could not pre-buy the next
-- season. Now each package names its season (meta season_start/end month/day);
-- renter_membership_season_window() picks the current-or-next instance of that
-- season in Asia/Tbilisi and the pending row stores it. Approval keeps the stored
-- window (starts_at = greatest(now(), start)); a request whose season already
-- ended must be rejected (MEMBERSHIP_SEASON_ENDED → reject refunds automatically).
-- MEMBERSHIP_ALREADY_ACTIVE now means "overlaps the remaining window", so a summer
-- member can buy the coming winter. Purchase-time errors keep the existing tokens,
-- so the purchase-vip edge function needs no redeploy.
--
-- The FB-group tier is SELF-DECLARED at purchase (package meta price_tier =
-- 'fb_group_vip'); the admin verifies it in the existing approval step.
-- Both RPC bodies are restated verbatim from 20260819121000 (live md5 verified)
-- with only the season/overlap/notification changes. renter_membership_season_end
-- is dropped: only these two bodies called it. Existing subscriptions keep their
-- stored dates (the active row ending 2027-03-15 is untouched).

CREATE OR REPLACE FUNCTION public.renter_membership_season_window(
  p_at timestamptz,
  p_start_month integer,
  p_start_day integer,
  p_end_month integer,
  p_end_day integer
)
RETURNS TABLE (window_start timestamptz, window_end timestamptz)
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $$
DECLARE
  v_local date := (p_at AT TIME ZONE 'Asia/Tbilisi')::date;
  v_year integer := extract(year FROM v_local)::integer;
  v_start date;
  v_end date;
BEGIN
  IF p_start_month NOT BETWEEN 1 AND 12 OR p_end_month NOT BETWEEN 1 AND 12
     OR p_start_day NOT BETWEEN 1 AND 31 OR p_end_day NOT BETWEEN 1 AND 31 THEN
    RAISE EXCEPTION 'SEASON_WINDOW_INVALID' USING ERRCODE = '22023';
  END IF;

  BEGIN
    IF (p_start_month, p_start_day) <= (p_end_month, p_end_day) THEN
      -- Season inside one calendar year (summer: Apr 1 – Oct 31).
      v_start := make_date(v_year, p_start_month, p_start_day);
      v_end := make_date(v_year, p_end_month, p_end_day);
      IF v_local > v_end THEN
        v_start := make_date(v_year + 1, p_start_month, p_start_day);
        v_end := make_date(v_year + 1, p_end_month, p_end_day);
      END IF;
    ELSIF v_local <= make_date(v_year, p_end_month, p_end_day) THEN
      -- Wrapping season (winter: Nov 1 – Mar 31), still in its Jan–Mar part.
      v_start := make_date(v_year - 1, p_start_month, p_start_day);
      v_end := make_date(v_year, p_end_month, p_end_day);
    ELSE
      -- Wrapping season, current (Nov–Dec) or upcoming (Apr–Oct) instance.
      v_start := make_date(v_year, p_start_month, p_start_day);
      v_end := make_date(v_year + 1, p_end_month, p_end_day);
    END IF;
  EXCEPTION WHEN datetime_field_overflow THEN
    RAISE EXCEPTION 'SEASON_WINDOW_INVALID' USING ERRCODE = '22023';
  END;

  window_start := v_start::timestamp AT TIME ZONE 'Asia/Tbilisi';
  window_end := (v_end + time '23:59:59.999999') AT TIME ZONE 'Asia/Tbilisi';
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.renter_membership_season_window(timestamptz, integer, integer, integer, integer)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.renter_membership_season_window(timestamptz, integer, integer, integer, integer)
  TO authenticated, service_role;

-- Enabled renter membership plans with their current-or-next season window, so
-- the dashboard never recomputes season dates in the browser. SECURITY INVOKER:
-- the "pricing_packages public read enabled" policy bounds it.
CREATE OR REPLACE FUNCTION public.renter_membership_plans()
RETURNS TABLE (
  id uuid,
  code text,
  name text,
  label text,
  amount_gel numeric,
  sort_order integer,
  season text,
  price_tier text,
  window_start timestamptz,
  window_end timestamptz
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT p.id, p.code, p.name, p.label, p.amount_gel, p.sort_order,
         p.meta ->> 'season', p.meta ->> 'price_tier',
         w.window_start, w.window_end
  FROM public.pricing_packages p
  CROSS JOIN LATERAL public.renter_membership_season_window(
    now(),
    (p.meta ->> 'season_start_month')::integer,
    (p.meta ->> 'season_start_day')::integer,
    (p.meta ->> 'season_end_month')::integer,
    (p.meta ->> 'season_end_day')::integer
  ) w
  WHERE p.category = 'subscription'
    AND p.is_enabled
    AND p.meta ->> 'subscription_scope' = 'renter'
    AND p.meta ->> 'billing_period' = 'seasonal'
    AND p.meta ? 'season_start_month'
  ORDER BY p.sort_order, p.amount_gel;
$$;

REVOKE ALL ON FUNCTION public.renter_membership_plans() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.renter_membership_plans() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.purchase_renter_membership(
  p_user_id uuid,
  p_package_id uuid
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
    user_id, package_id, starts_at, expires_at, status, amount_paid
  ) VALUES (
    p_user_id, v_pkg.id, v_window_start, v_expires_at, 'pending_approval', v_pkg.amount_gel
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

REVOKE ALL ON FUNCTION public.purchase_renter_membership(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purchase_renter_membership(uuid, uuid)
  TO service_role;

CREATE OR REPLACE FUNCTION public.review_renter_membership(
  p_subscription_id uuid,
  p_admin_id uuid,
  p_action text,
  p_note text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  v_sub record;
  v_starts_at timestamptz;
  v_expires_at timestamptz;
  v_refund numeric;
BEGIN
  IF p_action NOT IN ('approve', 'reject') THEN
    RAISE EXCEPTION 'MEMBERSHIP_REVIEW_ACTION_INVALID' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = p_admin_id AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'MEMBERSHIP_REVIEW_FORBIDDEN' USING ERRCODE = '42501';
  END IF;

  SELECT s.*, p.name AS package_name, p.meta AS package_meta
    INTO v_sub
  FROM public.user_subscriptions s
  LEFT JOIN public.pricing_packages p ON p.id = s.package_id
  WHERE s.id = p_subscription_id
  FOR UPDATE OF s;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'MEMBERSHIP_REQUEST_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  -- Same-action retries are safe and never grant/refund twice.
  IF v_sub.status = (CASE WHEN p_action = 'approve' THEN 'active' ELSE 'rejected' END) THEN
    RETURN json_build_object(
      'subscription_id', v_sub.id,
      'status', v_sub.status,
      'expires_at', v_sub.expires_at,
      'idempotent', true
    );
  END IF;
  IF v_sub.status <> 'pending_approval' THEN
    RAISE EXCEPTION 'MEMBERSHIP_ALREADY_REVIEWED' USING ERRCODE = 'P0001';
  END IF;

  IF p_action = 'approve' THEN
    -- The season window was fixed at purchase; approval keeps it. A request
    -- whose season already ended must be rejected (automatic refund) instead.
    IF v_sub.expires_at <= now() THEN
      RAISE EXCEPTION 'MEMBERSHIP_SEASON_ENDED' USING ERRCODE = 'P0001';
    END IF;
    v_starts_at := greatest(now(), v_sub.starts_at);
    v_expires_at := v_sub.expires_at;

    IF EXISTS (
      SELECT 1 FROM public.user_subscriptions
      WHERE user_id = v_sub.user_id
        AND id <> v_sub.id
        AND status = 'active'
        AND starts_at < v_expires_at
        AND expires_at > v_starts_at
    ) THEN
      RAISE EXCEPTION 'MEMBERSHIP_ALREADY_ACTIVE' USING ERRCODE = 'P0001';
    END IF;

    UPDATE public.user_subscriptions
    SET status = 'active',
        starts_at = v_starts_at,
        expires_at = v_expires_at,
        reviewed_by = p_admin_id,
        reviewed_at = now(),
        review_note = nullif(btrim(p_note), '')
    WHERE id = v_sub.id;

    PERFORM public._notify(
      v_sub.user_id,
      'membership_approved',
      'სეზონური საწევრო დამტკიცდა',
      CASE
        WHEN v_starts_at > now() THEN format('თქვენი საწევრო დამტკიცდა და მოქმედებს %s – %s.',
          to_char(v_starts_at AT TIME ZONE 'Asia/Tbilisi', 'YYYY-MM-DD'),
          to_char(v_expires_at AT TIME ZONE 'Asia/Tbilisi', 'YYYY-MM-DD'))
        ELSE format('თქვენი საწევრო აქტიურია %s-მდე.',
          to_char(v_expires_at AT TIME ZONE 'Asia/Tbilisi', 'YYYY-MM-DD'))
      END,
      '/dashboard/renter',
      'renter'
    );
    PERFORM public._enqueue_system_sms(
      v_sub.user_id,
      'subscription',
      'MyBakuriani: თქვენი სეზონური საწევრო დამტკიცდა.'
    );
  ELSE
    v_refund := coalesce(v_sub.amount_paid, 0);

    UPDATE public.user_subscriptions
    SET status = 'rejected',
        reviewed_by = p_admin_id,
        reviewed_at = now(),
        review_note = nullif(btrim(p_note), '')
    WHERE id = v_sub.id;

    IF v_refund > 0 THEN
      INSERT INTO public.balances (user_id, amount, sms_remaining)
      VALUES (v_sub.user_id, v_refund, 0)
      ON CONFLICT (user_id) DO UPDATE
      SET amount = public.balances.amount + EXCLUDED.amount,
          updated_at = now();

      INSERT INTO public.transactions (
        user_id, amount, type, description, reference_id
      ) VALUES (
        v_sub.user_id,
        v_refund,
        'membership_refund',
        format('%s (საწევროს დაბრუნება)', coalesce(v_sub.package_name, 'სეზონური საწევრო')),
        v_sub.id
      );
    END IF;

    PERFORM public._notify(
      v_sub.user_id,
      'membership_rejected',
      'საწევრო არ დამტკიცდა',
      CASE
        WHEN nullif(btrim(p_note), '') IS NULL
          THEN format('გადახდილი %s ₾ დაბრუნდა თქვენს ბალანსზე.', v_refund)
        ELSE format('მიზეზი: %s გადახდილი %s ₾ დაბრუნდა თქვენს ბალანსზე.', btrim(p_note), v_refund)
      END,
      '/dashboard/renter',
      'renter'
    );
  END IF;

  RETURN json_build_object(
    'subscription_id', v_sub.id,
    'status', CASE WHEN p_action = 'approve' THEN 'active' ELSE 'rejected' END,
    'expires_at', CASE WHEN p_action = 'approve' THEN v_expires_at ELSE v_sub.expires_at END,
    'refunded', CASE WHEN p_action = 'reject' THEN v_refund ELSE 0 END,
    'idempotent', false
  );
END;
$fn$;

REVOKE ALL ON FUNCTION public.review_renter_membership(uuid, uuid, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.review_renter_membership(uuid, uuid, text, text)
  TO service_role;

INSERT INTO public.pricing_packages
  (category, code, name, label, amount_gel, is_enabled, sort_order, description, meta)
VALUES
  ('subscription', 'renter-summer-fb-vip', 'ზაფხულის სეზონი — ჩვენი Facebook ჯგუფის VIP წევრი', 'აპრილი – ოქტომბერი', 30, true, 11, NULL, '{"subscription_scope": "renter", "billing_period": "seasonal", "season": "summer", "price_tier": "fb_group_vip", "season_start_month": 4, "season_start_day": 1, "season_end_month": 10, "season_end_day": 31}'::jsonb),
  ('subscription', 'renter-summer-standard', 'ზაფხულის სეზონი — სხვა მომხმარებელი', 'აპრილი – ოქტომბერი', 60, true, 12, NULL, '{"subscription_scope": "renter", "billing_period": "seasonal", "season": "summer", "price_tier": "standard", "season_start_month": 4, "season_start_day": 1, "season_end_month": 10, "season_end_day": 31}'::jsonb),
  ('subscription', 'renter-winter-fb-vip', 'ზამთრის სეზონი — ჩვენი Facebook ჯგუფის VIP წევრი', 'ნოემბერი – მარტი', 30, true, 13, NULL, '{"subscription_scope": "renter", "billing_period": "seasonal", "season": "winter", "price_tier": "fb_group_vip", "season_start_month": 11, "season_start_day": 1, "season_end_month": 3, "season_end_day": 31}'::jsonb),
  ('subscription', 'renter-winter-standard', 'ზამთრის სეზონი — სხვა მომხმარებელი', 'ნოემბერი – მარტი', 60, true, 14, NULL, '{"subscription_scope": "renter", "billing_period": "seasonal", "season": "winter", "price_tier": "standard", "season_start_month": 11, "season_start_day": 1, "season_end_month": 3, "season_end_day": 31}'::jsonb)
ON CONFLICT (category, code) DO UPDATE SET
  name        = EXCLUDED.name,
  label       = EXCLUDED.label,
  amount_gel  = EXCLUDED.amount_gel,
  is_enabled  = EXCLUDED.is_enabled,
  sort_order  = EXCLUDED.sort_order,
  description = EXCLUDED.description,
  meta        = EXCLUDED.meta,
  updated_at  = now();

-- The pre-2026 renter packages (one Mar-15 "season"; the old 3-month plan) are
-- disabled, not deleted: user_subscriptions rows reference them.
UPDATE public.pricing_packages
SET is_enabled = false,
    updated_at = now()
WHERE category = 'subscription'
  AND code IN ('renter-membership-1-month', 'renter-membership-3-months')
  AND is_enabled;

DROP FUNCTION IF EXISTS public.renter_membership_season_end(timestamptz, integer, integer);

NOTIFY pgrst, 'reload schema';
