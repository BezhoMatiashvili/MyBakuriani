-- Renter membership is a paid request, not an immediately active entitlement.
-- Payment creates one pending request for the current Bakuriani season; an
-- AAL2-protected admin route calls review_renter_membership() to approve it.

ALTER TABLE public.user_subscriptions
  ADD COLUMN IF NOT EXISTS amount_paid numeric(10,2),
  ADD COLUMN IF NOT EXISTS payment_transaction_id uuid REFERENCES public.transactions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reviewed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS review_note text;

CREATE UNIQUE INDEX IF NOT EXISTS user_subscriptions_one_pending_renter_idx
  ON public.user_subscriptions (user_id)
  WHERE status = 'pending_approval';

CREATE INDEX IF NOT EXISTS user_subscriptions_pending_created_idx
  ON public.user_subscriptions (created_at, id)
  WHERE status = 'pending_approval';

-- Membership is valid through March 15 in Tbilisi.  A purchase made after that
-- date belongs to the season ending the following March 15.  Returning the end
-- of the local day keeps the UI's displayed date and the access boundary equal.
CREATE OR REPLACE FUNCTION public.renter_membership_season_end(
  p_at timestamptz DEFAULT now(),
  p_end_month integer DEFAULT 3,
  p_end_day integer DEFAULT 15
)
RETURNS timestamptz
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $fn$
DECLARE
  v_local_date date := (p_at AT TIME ZONE 'Asia/Tbilisi')::date;
  v_year integer := extract(year FROM v_local_date)::integer;
  v_cutoff_date date;
BEGIN
  IF p_end_month NOT BETWEEN 1 AND 12 OR p_end_day NOT BETWEEN 1 AND 31 THEN
    RAISE EXCEPTION 'SEASON_END_INVALID' USING ERRCODE = '22023';
  END IF;

  BEGIN
    v_cutoff_date := make_date(v_year, p_end_month, p_end_day);
  EXCEPTION WHEN datetime_field_overflow THEN
    RAISE EXCEPTION 'SEASON_END_INVALID' USING ERRCODE = '22023';
  END;

  IF v_local_date > v_cutoff_date THEN
    v_cutoff_date := make_date(v_year + 1, p_end_month, p_end_day);
  END IF;

  RETURN (v_cutoff_date + time '23:59:59.999999')
    AT TIME ZONE 'Asia/Tbilisi';
END;
$fn$;

REVOKE ALL ON FUNCTION public.renter_membership_season_end(timestamptz, integer, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.renter_membership_season_end(timestamptz, integer, integer)
  TO service_role;

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
  v_end_month integer;
  v_end_day integer;
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
  IF EXISTS (
    SELECT 1 FROM public.user_subscriptions
    WHERE user_id = p_user_id
      AND status = 'active'
      AND starts_at <= now()
      AND expires_at > now()
  ) THEN
    RAISE EXCEPTION 'MEMBERSHIP_ALREADY_ACTIVE' USING ERRCODE = 'P0001';
  END IF;

  v_end_month := coalesce(nullif(v_pkg.meta ->> 'season_end_month', '')::integer, 3);
  v_end_day := coalesce(nullif(v_pkg.meta ->> 'season_end_day', '')::integer, 15);
  v_expires_at := public.renter_membership_season_end(now(), v_end_month, v_end_day);

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
    p_user_id, v_pkg.id, now(), v_expires_at, 'pending_approval', v_pkg.amount_gel
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
    format('სეზონური საწევრო გადახდილია და ადმინისტრატორის დადასტურებას ელოდება. სეზონის ბოლოა %s.',
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
  v_end_month integer;
  v_end_day integer;
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
    IF EXISTS (
      SELECT 1 FROM public.user_subscriptions
      WHERE user_id = v_sub.user_id
        AND id <> v_sub.id
        AND status = 'active'
        AND starts_at <= now()
        AND expires_at > now()
    ) THEN
      RAISE EXCEPTION 'MEMBERSHIP_ALREADY_ACTIVE' USING ERRCODE = 'P0001';
    END IF;

    v_end_month := coalesce(nullif(v_sub.package_meta ->> 'season_end_month', '')::integer, 3);
    v_end_day := coalesce(nullif(v_sub.package_meta ->> 'season_end_day', '')::integer, 15);
    v_expires_at := public.renter_membership_season_end(now(), v_end_month, v_end_day);

    UPDATE public.user_subscriptions
    SET status = 'active',
        starts_at = now(),
        expires_at = v_expires_at,
        reviewed_by = p_admin_id,
        reviewed_at = now(),
        review_note = nullif(btrim(p_note), '')
    WHERE id = v_sub.id;

    PERFORM public._notify(
      v_sub.user_id,
      'membership_approved',
      'სეზონური საწევრო დამტკიცდა',
      format('თქვენი საწევრო აქტიურია %s-მდე.',
        to_char(v_expires_at AT TIME ZONE 'Asia/Tbilisi', 'YYYY-MM-DD')),
      '/dashboard/renter',
      'renter'
    );
    PERFORM public._enqueue_system_sms(
      v_sub.user_id,
      'subscription',
      'MyBakuriani: თქვენი სეზონური საწევრო დამტკიცდა და გააქტიურდა.'
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

-- Convert every renter plan to the seasonal contract. Keep the established
-- one-month seed as the canonical season package and retire the old 3-month
-- alternative so buyers never see competing prices for the same entitlement.
UPDATE public.pricing_packages
SET meta = (coalesce(meta, '{}'::jsonb) - 'duration_months') ||
    '{"subscription_scope":"renter","billing_period":"seasonal","season_end_month":3,"season_end_day":15}'::jsonb,
    updated_at = now()
WHERE category = 'subscription' AND meta ->> 'subscription_scope' = 'renter';

UPDATE public.pricing_packages
SET name = 'Renter membership — season',
    label = 'Season',
    description = 'Account-wide renter membership through March 15.',
    updated_at = now()
WHERE category = 'subscription' AND code = 'renter-membership-1-month';

UPDATE public.pricing_packages
SET is_enabled = false, updated_at = now()
WHERE category = 'subscription' AND code = 'renter-membership-3-months';

-- Already-paid, currently-active renter memberships become seasonal too; this
-- never shortens a future entitlement because March 15 is compared with the
-- existing expiry and only the later boundary wins.
UPDATE public.user_subscriptions s
SET expires_at = greatest(
  s.expires_at,
  public.renter_membership_season_end(now(), 3, 15)
)
FROM public.pricing_packages p
WHERE p.id = s.package_id
  AND p.meta ->> 'subscription_scope' = 'renter'
  AND s.status = 'active'
  AND s.expires_at > now();

-- Approval changes should appear on an already-open renter dashboard.
DO $block$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
     AND NOT EXISTS (
       SELECT 1 FROM pg_publication_tables
       WHERE pubname = 'supabase_realtime'
         AND schemaname = 'public'
         AND tablename = 'user_subscriptions'
     ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.user_subscriptions;
  END IF;
END;
$block$;

NOTIFY pgrst, 'reload schema';
