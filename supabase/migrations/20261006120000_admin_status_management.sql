-- 20261006120000_admin_status_management.sql
--
-- Admin management of the four paid statuses (contract C44):
--   * seasonal renter membership  (user_subscriptions, per user; C31)
--   * listing VIP / SUPER VIP      (properties/services is_vip, is_super_vip, vip_expires_at; C23)
--   * listing discount badge       (discount_percent, discount_expires_at; C10)
--   * company plan                 (organization_subscriptions; C11)
--
-- One SECURITY DEFINER RPC per kind serves both the preview and the apply.
-- It checks the admin, takes the purchase paths' locks, performs every row
-- change with UPDATE/INSERT ... RETURNING (post-trigger values) and, when
-- p_dry_run, rolls the writes back by raising MBDRY inside a sub-block. The
-- collected per-row results survive the rollback (PL/pgSQL variables are not
-- transactional), so the preview is exactly what the apply would write,
-- trigger effects, notifications, refunds and audit rows included.
--
-- Rows that cannot take the action come back as outcome 'skipped' with a
-- reason code; input errors raise ADMIN_STATUS_* tokens before any write.
-- Dates are Asia/Tbilisi calendar days: an end date means 23:59:59.999999
-- of that day (the season-window convention), a start date 00:00. Georgia
-- has no DST, so a day is interval '1 day'.
--
-- The browser never calls these: the admin API (/api/admin/statuses/**)
-- uses the service role and sends x-actor-id, so trg_audit_row records the
-- admin. EXECUTE / SELECT are service_role only (C34).

SET LOCAL search_path = public;

-- ---------------------------------------------------------------------------
-- 1. user_subscriptions.status vocabulary (was free text) + 'revoked'
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.user_subscriptions
    WHERE status NOT IN ('pending_approval', 'active', 'rejected', 'revoked')
  ) THEN
    RAISE EXCEPTION 'user_subscriptions holds a status outside the C44 vocabulary'
      USING ERRCODE = '55000';
  END IF;
END $$;

ALTER TABLE public.user_subscriptions
  DROP CONSTRAINT IF EXISTS user_subscriptions_status_check;
ALTER TABLE public.user_subscriptions
  ADD CONSTRAINT user_subscriptions_status_check
  CHECK (status IN ('pending_approval', 'active', 'rejected', 'revoked'));

-- ---------------------------------------------------------------------------
-- 2. Company plans become audited (admin edits carry the actor)
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_audit_row ON public.organization_subscriptions;
CREATE TRIGGER trg_audit_row
  AFTER INSERT OR UPDATE OR DELETE ON public.organization_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.audit_row_change();

-- ---------------------------------------------------------------------------
-- 3. Small private helpers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._admin_status_day_end(p_date date)
RETURNS timestamptz
LANGUAGE sql STABLE
SET search_path = public, pg_temp
AS $$
  SELECT (p_date + time '23:59:59.999999') AT TIME ZONE 'Asia/Tbilisi';
$$;

CREATE OR REPLACE FUNCTION public._admin_status_day_start(p_date date)
RETURNS timestamptz
LANGUAGE sql STABLE
SET search_path = public, pg_temp
AS $$
  SELECT p_date::timestamp AT TIME ZONE 'Asia/Tbilisi';
$$;

CREATE OR REPLACE FUNCTION public._admin_status_local_date(p_at timestamptz)
RETURNS text
LANGUAGE sql STABLE
SET search_path = public, pg_temp
AS $$
  SELECT to_char(p_at AT TIME ZONE 'Asia/Tbilisi', 'YYYY-MM-DD');
$$;

CREATE OR REPLACE FUNCTION public._admin_status_local_datetime(p_at timestamptz)
RETURNS text
LANGUAGE sql STABLE
SET search_path = public, pg_temp
AS $$
  SELECT to_char(p_at AT TIME ZONE 'Asia/Tbilisi', 'YYYY-MM-DD HH24:MI');
$$;

-- Seconds two half-open windows share (0 when they do not touch).
CREATE OR REPLACE FUNCTION public._admin_status_overlap_seconds(
  p_a_start timestamptz, p_a_end timestamptz,
  p_b_start timestamptz, p_b_end timestamptz
)
RETURNS numeric
LANGUAGE sql IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT greatest(
    0::numeric,
    extract(epoch FROM (least(p_a_end, p_b_end) - greatest(p_a_start, p_b_start)))::numeric
  );
$$;

CREATE OR REPLACE FUNCTION public._admin_status_require_admin(p_admin_id uuid)
RETURNS void
LANGUAGE plpgsql STABLE
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_admin_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = p_admin_id AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'ADMIN_STATUS_FORBIDDEN' USING ERRCODE = '42501';
  END IF;
END;
$$;

-- Shared input checks: day count and end date (Tbilisi today .. today + 2 years).
CREATE OR REPLACE FUNCTION public._admin_status_check_days(p_days integer)
RETURNS void
LANGUAGE plpgsql IMMUTABLE
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_days IS NULL OR p_days < 1 OR p_days > 365 THEN
    RAISE EXCEPTION 'ADMIN_STATUS_DAYS_INVALID' USING ERRCODE = '22023';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public._admin_status_check_end_date(p_date date)
RETURNS void
LANGUAGE plpgsql STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_today date := (now() AT TIME ZONE 'Asia/Tbilisi')::date;
BEGIN
  IF p_date IS NULL OR p_date < v_today OR p_date > (v_today + interval '2 years')::date THEN
    RAISE EXCEPTION 'ADMIN_STATUS_DATE_INVALID' USING ERRCODE = '22023';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public._admin_status_day_end(date) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._admin_status_day_start(date) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._admin_status_local_date(timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._admin_status_local_datetime(timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._admin_status_overlap_seconds(timestamptz, timestamptz, timestamptz, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._admin_status_require_admin(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._admin_status_check_days(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._admin_status_check_end_date(date) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Read views for the admin page (service_role only)
-- ---------------------------------------------------------------------------

-- One row per profile. `cur` uses the C31 predicate word for word, so
-- covered_now is exactly "this owner's rentals are public right now".
-- `cov` is the coverage row the bulk actions move: the live (not yet
-- expired) active row that ends last.
CREATE OR REPLACE VIEW public.admin_membership_overview_v AS
SELECT
  p.id AS user_id,
  p.display_name,
  p.phone,
  p.role::text AS role,
  p.created_at AS profile_created_at,
  (cur.id IS NOT NULL) AS covered_now,
  cur.id AS current_id,
  cur.starts_at AS current_starts_at,
  cur.expires_at AS current_expires_at,
  cur.package_code AS current_package_code,
  cur.season AS current_season,
  cur.price_tier AS current_price_tier,
  nxt.id AS next_id,
  nxt.starts_at AS next_starts_at,
  nxt.expires_at AS next_expires_at,
  nxt.package_code AS next_package_code,
  nxt.season AS next_season,
  nxt.price_tier AS next_price_tier,
  cov.id AS coverage_id,
  cov.starts_at AS coverage_starts_at,
  cov.expires_at AS coverage_expires_at,
  pend.id AS pending_id,
  pend.created_at AS pending_created_at,
  pend.package_code AS pending_package_code,
  pend.season AS pending_season,
  coalesce(agg.row_count, 0) AS row_count,
  agg.last_expired_at,
  agg.latest_status,
  coalesce(r.total, 0) AS rental_count,
  coalesce(r.active, 0) AS active_rental_count,
  CASE
    WHEN cur.id IS NOT NULL THEN 'active'
    WHEN cov.id IS NOT NULL THEN 'upcoming'
    WHEN pend.id IS NOT NULL THEN 'pending'
    WHEN agg.latest_status = 'revoked' THEN 'revoked'
    WHEN agg.last_expired_at IS NOT NULL THEN 'expired'
    ELSE 'none'
  END AS state
FROM public.profiles p
LEFT JOIN LATERAL (
  SELECT s.id, s.starts_at, s.expires_at, pp.code AS package_code,
         pp.meta ->> 'season' AS season, pp.meta ->> 'price_tier' AS price_tier
  FROM public.user_subscriptions s
  LEFT JOIN public.pricing_packages pp ON pp.id = s.package_id
  WHERE s.user_id = p.id
    AND s.status = 'active'
    AND s.starts_at <= now()
    AND s.expires_at > now()
  ORDER BY s.expires_at DESC, s.id DESC
  LIMIT 1
) cur ON true
LEFT JOIN LATERAL (
  SELECT s.id, s.starts_at, s.expires_at, pp.code AS package_code,
         pp.meta ->> 'season' AS season, pp.meta ->> 'price_tier' AS price_tier
  FROM public.user_subscriptions s
  LEFT JOIN public.pricing_packages pp ON pp.id = s.package_id
  WHERE s.user_id = p.id
    AND s.status = 'active'
    AND s.starts_at > now()
  ORDER BY s.starts_at ASC, s.id ASC
  LIMIT 1
) nxt ON true
LEFT JOIN LATERAL (
  SELECT s.id, s.starts_at, s.expires_at
  FROM public.user_subscriptions s
  WHERE s.user_id = p.id
    AND s.status = 'active'
    AND s.expires_at > now()
  ORDER BY s.expires_at DESC, s.starts_at DESC, s.id DESC
  LIMIT 1
) cov ON true
LEFT JOIN LATERAL (
  SELECT s.id, s.created_at, pp.code AS package_code, pp.meta ->> 'season' AS season
  FROM public.user_subscriptions s
  LEFT JOIN public.pricing_packages pp ON pp.id = s.package_id
  WHERE s.user_id = p.id
    AND s.status = 'pending_approval'
  ORDER BY s.created_at ASC
  LIMIT 1
) pend ON true
LEFT JOIN LATERAL (
  SELECT count(*)::integer AS row_count,
         max(s.expires_at) FILTER (WHERE s.status = 'active' AND s.expires_at <= now()) AS last_expired_at,
         (array_agg(s.status ORDER BY s.created_at DESC, s.id DESC))[1] AS latest_status
  FROM public.user_subscriptions s
  WHERE s.user_id = p.id
) agg ON true
LEFT JOIN LATERAL (
  SELECT count(*)::integer AS total,
         (count(*) FILTER (WHERE pr.status = 'active'))::integer AS active
  FROM public.properties pr
  WHERE pr.owner_id = p.id
    AND NOT coalesce(pr.is_for_sale, false)
) r ON true;

-- One row per listing (properties + services). vip_tier / discount_active use
-- the public views' semantics: a flag counts only while its expiry is NULL
-- (permanent) or in the future.
CREATE OR REPLACE VIEW public.admin_listing_promotions_v AS
SELECT
  'property'::text AS kind,
  pr.id,
  pr.title,
  CASE
    WHEN coalesce(pr.is_for_sale, false) THEN 'sale'
    WHEN pr.type = 'hotel' THEN 'hotel'
    ELSE 'rental'
  END AS category,
  pr.type::text AS subtype,
  pr.status::text AS status,
  pr.owner_id,
  o.display_name AS owner_name,
  o.phone AS owner_phone,
  pr.photos[1] AS cover_photo,
  pr.created_at,
  coalesce(pr.is_vip, false) AS is_vip,
  coalesce(pr.is_super_vip, false) AS is_super_vip,
  pr.vip_expires_at,
  CASE
    WHEN pr.is_super_vip IS TRUE AND (pr.vip_expires_at IS NULL OR pr.vip_expires_at > now()) THEN 'super'
    WHEN pr.is_vip IS TRUE AND (pr.vip_expires_at IS NULL OR pr.vip_expires_at > now()) THEN 'vip'
  END AS vip_tier,
  ((pr.is_super_vip IS TRUE OR pr.is_vip IS TRUE) AND pr.vip_expires_at IS NULL) AS vip_permanent,
  coalesce(pr.discount_percent, 0) AS discount_percent,
  pr.discount_expires_at,
  (coalesce(pr.discount_percent, 0) > 0
    AND (pr.discount_expires_at IS NULL OR pr.discount_expires_at > now())) AS discount_active,
  (coalesce(pr.discount_percent, 0) > 0 AND pr.discount_expires_at IS NULL) AS discount_permanent,
  true AS discount_applicable
FROM public.properties pr
LEFT JOIN public.profiles o ON o.id = pr.owner_id
UNION ALL
SELECT
  'service'::text AS kind,
  s.id,
  s.title,
  s.category::text AS category,
  s.category::text AS subtype,
  s.status::text AS status,
  s.owner_id,
  o.display_name AS owner_name,
  o.phone AS owner_phone,
  s.photos[1] AS cover_photo,
  s.created_at,
  coalesce(s.is_vip, false) AS is_vip,
  coalesce(s.is_super_vip, false) AS is_super_vip,
  s.vip_expires_at,
  CASE
    WHEN s.is_super_vip IS TRUE AND (s.vip_expires_at IS NULL OR s.vip_expires_at > now()) THEN 'super'
    WHEN s.is_vip IS TRUE AND (s.vip_expires_at IS NULL OR s.vip_expires_at > now()) THEN 'vip'
  END AS vip_tier,
  ((s.is_super_vip IS TRUE OR s.is_vip IS TRUE) AND s.vip_expires_at IS NULL) AS vip_permanent,
  coalesce(s.discount_percent, 0) AS discount_percent,
  s.discount_expires_at,
  (s.category <> 'food'
    AND coalesce(s.discount_percent, 0) > 0
    AND (s.discount_expires_at IS NULL OR s.discount_expires_at > now())) AS discount_active,
  (s.category <> 'food' AND coalesce(s.discount_percent, 0) > 0 AND s.discount_expires_at IS NULL) AS discount_permanent,
  (s.category <> 'food') AS discount_applicable
FROM public.services s
LEFT JOIN public.profiles o ON o.id = s.owner_id;

-- One row per organization; `cur` is the plan enforce_org_listing_rules reads.
CREATE OR REPLACE VIEW public.admin_company_plans_v AS
SELECT
  org.id AS organization_id,
  org.brand_name,
  org.legal_name,
  org.status AS org_status,
  org.owner_id,
  o.display_name AS owner_name,
  o.phone AS owner_phone,
  org.created_at,
  cur.id AS plan_id,
  cur.tier,
  cur.listing_limit,
  cur.starts_at,
  cur.expires_at,
  cur.amount_gel,
  (SELECT count(*)::integer FROM public.properties p WHERE p.organization_id = org.id) AS used_listings,
  lst.tier AS last_tier,
  lst.expires_at AS last_expires_at,
  CASE
    WHEN cur.id IS NOT NULL THEN 'active'
    WHEN lst.id IS NOT NULL THEN 'expired'
    ELSE 'none'
  END AS state
FROM public.organizations org
LEFT JOIN public.profiles o ON o.id = org.owner_id
LEFT JOIN LATERAL (
  SELECT s.id, s.tier, s.listing_limit, s.starts_at, s.expires_at, s.amount_gel
  FROM public.organization_subscriptions s
  WHERE s.organization_id = org.id
    AND s.status = 'active'
    AND s.expires_at > now()
  ORDER BY s.expires_at DESC, s.id DESC
  LIMIT 1
) cur ON true
LEFT JOIN LATERAL (
  SELECT s.id, s.tier, s.expires_at
  FROM public.organization_subscriptions s
  WHERE s.organization_id = org.id
    AND (s.status <> 'active' OR s.expires_at <= now())
  ORDER BY s.expires_at DESC, s.id DESC
  LIMIT 1
) lst ON true;

REVOKE ALL ON public.admin_membership_overview_v FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.admin_listing_promotions_v FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.admin_company_plans_v FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.admin_membership_overview_v TO service_role;
GRANT SELECT ON public.admin_listing_promotions_v TO service_role;
GRANT SELECT ON public.admin_company_plans_v TO service_role;

-- ---------------------------------------------------------------------------
-- 5. Memberships
-- ---------------------------------------------------------------------------
-- Actions (p_user_ids unless noted):
--   extend N / shorten N / set_end DATE  -> the user's coverage row
--   grant (DATES | PACKAGE season)       -> a new active row, amount_paid 0
--   revoke [+refund]                     -> every live active row -> 'revoked'
--                                           (p_subscription_id: that row only,
--                                           with an optional custom refund)
--   set_period (p_subscription_id)       -> new start and/or end of one live row
-- No date change may create or widen an overlap with the user's other
-- active or pending rows.
CREATE OR REPLACE FUNCTION public.admin_change_memberships(
  p_admin_id uuid,
  p_action text,
  p_user_ids uuid[] DEFAULT NULL,
  p_subscription_id uuid DEFAULT NULL,
  p_days integer DEFAULT NULL,
  p_start_date date DEFAULT NULL,
  p_end_date date DEFAULT NULL,
  p_package_id uuid DEFAULT NULL,
  p_refund boolean DEFAULT false,
  p_refund_amount numeric DEFAULT NULL,
  p_notify boolean DEFAULT false,
  p_note text DEFAULT NULL,
  p_dry_run boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  c_actions CONSTANT text[] := ARRAY['extend', 'shorten', 'set_end', 'grant', 'revoke', 'set_period'];
  v_now timestamptz := now();
  v_today date := (now() AT TIME ZONE 'Asia/Tbilisi')::date;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_users uuid[];
  v_uid uuid;
  v_profile record;
  v_row record;
  v_other record;
  v_pkg record;
  v_new_start timestamptz;
  v_new_end timestamptz;
  v_grant_start timestamptz;
  v_grant_end timestamptz;
  v_after record;
  v_covered_before boolean;
  v_covered_after boolean;
  v_active_rentals integer;
  v_reason text;
  v_refundable numeric;
  v_refund numeric;
  v_refund_total numeric;
  v_user_changed boolean;
  v_title text;
  v_message text;
  v_rows jsonb := '[]'::jsonb;
  v_changed integer := 0;
  v_skipped integer := 0;
BEGIN
  PERFORM public._admin_status_require_admin(p_admin_id);

  IF p_action IS NULL OR NOT (p_action = ANY (c_actions)) THEN
    RAISE EXCEPTION 'ADMIN_STATUS_ACTION_INVALID' USING ERRCODE = '22023';
  END IF;
  IF v_note IS NOT NULL AND char_length(v_note) > 300 THEN
    RAISE EXCEPTION 'ADMIN_STATUS_NOTE_TOO_LONG' USING ERRCODE = '22023';
  END IF;

  -- Targets: one subscription row (set_period, single revoke) or 1..200 users.
  IF p_action = 'set_period' OR (p_action = 'revoke' AND p_subscription_id IS NOT NULL) THEN
    IF p_subscription_id IS NULL OR p_user_ids IS NOT NULL THEN
      RAISE EXCEPTION 'ADMIN_STATUS_TARGETS_INVALID' USING ERRCODE = '22023';
    END IF;
    SELECT s.user_id INTO v_uid FROM public.user_subscriptions s WHERE s.id = p_subscription_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'ADMIN_STATUS_SUBSCRIPTION_NOT_FOUND' USING ERRCODE = 'P0002';
    END IF;
    v_users := ARRAY[v_uid];
  ELSE
    IF p_subscription_id IS NOT NULL THEN
      RAISE EXCEPTION 'ADMIN_STATUS_TARGETS_INVALID' USING ERRCODE = '22023';
    END IF;
    SELECT coalesce(array_agg(DISTINCT u ORDER BY u), ARRAY[]::uuid[])
      INTO v_users
    FROM unnest(coalesce(p_user_ids, ARRAY[]::uuid[])) AS u
    WHERE u IS NOT NULL;
    IF cardinality(v_users) = 0 OR cardinality(v_users) > 200 THEN
      RAISE EXCEPTION 'ADMIN_STATUS_TARGETS_INVALID' USING ERRCODE = '22023';
    END IF;
  END IF;

  -- Per-action inputs (identical for every target, so checked once).
  IF p_action IN ('extend', 'shorten') THEN
    PERFORM public._admin_status_check_days(p_days);
  ELSIF p_action = 'set_end' THEN
    PERFORM public._admin_status_check_end_date(p_end_date);
  ELSIF p_action = 'set_period' THEN
    IF p_start_date IS NULL AND p_end_date IS NULL THEN
      RAISE EXCEPTION 'ADMIN_STATUS_PERIOD_REQUIRED' USING ERRCODE = '22023';
    END IF;
    IF p_end_date IS NOT NULL THEN
      PERFORM public._admin_status_check_end_date(p_end_date);
    END IF;
    IF p_start_date IS NOT NULL
       AND (p_start_date < (v_today - interval '2 years')::date
            OR p_start_date > (v_today + interval '2 years')::date) THEN
      RAISE EXCEPTION 'ADMIN_STATUS_DATE_INVALID' USING ERRCODE = '22023';
    END IF;
  ELSIF p_action = 'grant' THEN
    IF p_package_id IS NOT NULL THEN
      SELECT id, name, meta INTO v_pkg
      FROM public.pricing_packages
      WHERE id = p_package_id
        AND category = 'subscription'
        AND meta ->> 'subscription_scope' = 'renter';
      IF NOT FOUND THEN
        RAISE EXCEPTION 'ADMIN_STATUS_PACKAGE_INVALID' USING ERRCODE = '22023';
      END IF;
    END IF;
    IF p_end_date IS NOT NULL THEN
      PERFORM public._admin_status_check_end_date(p_end_date);
      IF p_start_date IS NOT NULL AND p_start_date < v_today THEN
        RAISE EXCEPTION 'ADMIN_STATUS_DATE_INVALID' USING ERRCODE = '22023';
      END IF;
      v_grant_start := CASE
        WHEN p_start_date IS NULL OR p_start_date = v_today THEN v_now
        ELSE public._admin_status_day_start(p_start_date)
      END;
      v_grant_end := public._admin_status_day_end(p_end_date);
    ELSIF p_package_id IS NOT NULL THEN
      IF p_start_date IS NOT NULL THEN
        RAISE EXCEPTION 'ADMIN_STATUS_PERIOD_REQUIRED' USING ERRCODE = '22023';
      END IF;
      IF coalesce(v_pkg.meta ->> 'billing_period', '') <> 'seasonal' THEN
        RAISE EXCEPTION 'ADMIN_STATUS_PACKAGE_INVALID' USING ERRCODE = '22023';
      END IF;
      BEGIN
        SELECT w.window_start, w.window_end INTO v_grant_start, v_grant_end
        FROM public.renter_membership_season_window(
          v_now,
          (v_pkg.meta ->> 'season_start_month')::integer,
          (v_pkg.meta ->> 'season_start_day')::integer,
          (v_pkg.meta ->> 'season_end_month')::integer,
          (v_pkg.meta ->> 'season_end_day')::integer
        ) w;
      EXCEPTION WHEN OTHERS THEN
        RAISE EXCEPTION 'ADMIN_STATUS_PACKAGE_INVALID' USING ERRCODE = '22023';
      END;
      IF v_grant_start IS NULL OR v_grant_end IS NULL THEN
        RAISE EXCEPTION 'ADMIN_STATUS_PACKAGE_INVALID' USING ERRCODE = '22023';
      END IF;
      v_grant_start := greatest(v_now, v_grant_start);
    ELSE
      RAISE EXCEPTION 'ADMIN_STATUS_PERIOD_REQUIRED' USING ERRCODE = '22023';
    END IF;
    IF v_grant_end <= v_grant_start THEN
      RAISE EXCEPTION 'ADMIN_STATUS_PERIOD_INVALID' USING ERRCODE = '22023';
    END IF;
  ELSIF p_action = 'revoke' THEN
    IF p_refund_amount IS NOT NULL AND (
         p_subscription_id IS NULL OR NOT coalesce(p_refund, false)
         OR p_refund_amount <= 0 OR p_refund_amount <> round(p_refund_amount, 2)
       ) THEN
      RAISE EXCEPTION 'ADMIN_STATUS_REFUND_INVALID' USING ERRCODE = '22023';
    END IF;
  END IF;

  BEGIN
    -- Same lock the purchase path takes, per user in id order, then every row
    -- of those users (pending ones too, so a concurrent approval serializes).
    FOREACH v_uid IN ARRAY v_users LOOP
      PERFORM pg_advisory_xact_lock(hashtextextended('renter-membership:' || v_uid::text, 0));
    END LOOP;
    PERFORM 1 FROM public.user_subscriptions
    WHERE user_id = ANY (v_users)
    ORDER BY id
    FOR UPDATE;

    FOREACH v_uid IN ARRAY v_users LOOP
      SELECT id, display_name INTO v_profile FROM public.profiles WHERE id = v_uid;
      IF NOT FOUND THEN
        v_rows := v_rows || jsonb_build_object(
          'target_id', NULL, 'user_id', v_uid, 'display_name', NULL,
          'outcome', 'skipped', 'reason', 'user_not_found');
        v_skipped := v_skipped + 1;
        CONTINUE;
      END IF;

      v_covered_before := EXISTS (
        SELECT 1 FROM public.user_subscriptions s
        WHERE s.user_id = v_uid AND s.status = 'active'
          AND s.starts_at <= now() AND s.expires_at > now());
      SELECT count(*)::integer INTO v_active_rentals
      FROM public.properties pr
      WHERE pr.owner_id = v_uid AND NOT coalesce(pr.is_for_sale, false) AND pr.status = 'active';
      v_user_changed := false;
      v_refund_total := 0;
      v_title := NULL;
      v_message := NULL;

      IF p_action = 'grant' THEN
        v_reason := NULL;
        SELECT o.status INTO v_other
        FROM public.user_subscriptions o
        WHERE o.user_id = v_uid
          AND o.status IN ('active', 'pending_approval')
          AND public._admin_status_overlap_seconds(v_grant_start, v_grant_end, o.starts_at, o.expires_at) > 0
        ORDER BY (o.status = 'pending_approval') DESC
        LIMIT 1;
        IF FOUND THEN
          v_reason := CASE WHEN v_other.status = 'pending_approval' THEN 'overlaps_pending' ELSE 'overlaps_existing' END;
        END IF;

        IF v_reason IS NOT NULL THEN
          v_rows := v_rows || jsonb_build_object(
            'target_id', NULL, 'user_id', v_uid, 'display_name', v_profile.display_name,
            'outcome', 'skipped', 'reason', v_reason,
            'after', jsonb_build_object('starts_at', v_grant_start, 'expires_at', v_grant_end));
          v_skipped := v_skipped + 1;
          CONTINUE;
        END IF;

        INSERT INTO public.user_subscriptions (
          user_id, package_id, starts_at, expires_at, status, amount_paid,
          reviewed_by, reviewed_at, review_note
        ) VALUES (
          v_uid, p_package_id, v_grant_start, v_grant_end, 'active', 0,
          p_admin_id, v_now, v_note
        )
        RETURNING id, status, starts_at, expires_at INTO v_after;

        v_covered_after := EXISTS (
          SELECT 1 FROM public.user_subscriptions s
          WHERE s.user_id = v_uid AND s.status = 'active'
            AND s.starts_at <= now() AND s.expires_at > now());
        v_rows := v_rows || jsonb_build_object(
          'target_id', v_after.id, 'user_id', v_uid, 'display_name', v_profile.display_name,
          'outcome', 'changed', 'reason', NULL,
          'before', NULL,
          'after', jsonb_build_object('status', v_after.status, 'starts_at', v_after.starts_at, 'expires_at', v_after.expires_at),
          'effects', jsonb_build_object('covered_before', v_covered_before, 'covered_after', v_covered_after,
                                        'active_rentals', v_active_rentals));
        v_changed := v_changed + 1;
        v_title := 'საწევრო მოგენიჭათ';
        v_message := format('ადმინისტრატორმა მოგანიჭათ სეზონური საწევრო: %s – %s.',
          public._admin_status_local_date(v_after.starts_at), public._admin_status_local_date(v_after.expires_at));
        v_user_changed := true;

      ELSIF p_action = 'revoke' THEN
        FOR v_row IN
          SELECT s.*, pp.name AS package_name
          FROM public.user_subscriptions s
          LEFT JOIN public.pricing_packages pp ON pp.id = s.package_id
          WHERE s.user_id = v_uid
            AND (p_subscription_id IS NULL OR s.id = p_subscription_id)
          ORDER BY s.starts_at, s.id
        LOOP
          CONTINUE WHEN p_subscription_id IS NULL
            AND NOT (v_row.status = 'active' AND v_row.expires_at > now());
          IF NOT (v_row.status = 'active' AND v_row.expires_at > now()) THEN
            v_rows := v_rows || jsonb_build_object(
              'target_id', v_row.id, 'user_id', v_uid, 'display_name', v_profile.display_name,
              'outcome', 'skipped', 'reason', 'not_live',
              'before', jsonb_build_object('status', v_row.status, 'starts_at', v_row.starts_at, 'expires_at', v_row.expires_at));
            v_skipped := v_skipped + 1;
            CONTINUE;
          END IF;

          v_refund := 0;
          IF coalesce(p_refund, false) THEN
            SELECT greatest(0, coalesce(v_row.amount_paid, 0) - coalesce(sum(t.amount), 0))
              INTO v_refundable
            FROM public.transactions t
            WHERE t.type = 'membership_refund' AND t.reference_id = v_row.id;
            v_refund := coalesce(p_refund_amount, v_refundable);
            IF v_refund > v_refundable THEN
              RAISE EXCEPTION 'ADMIN_STATUS_REFUND_TOO_LARGE' USING ERRCODE = '22023';
            END IF;
          END IF;

          UPDATE public.user_subscriptions
          SET status = 'revoked'
          WHERE id = v_row.id
          RETURNING id, status, starts_at, expires_at INTO v_after;

          IF v_refund > 0 THEN
            INSERT INTO public.balances (user_id, amount, sms_remaining)
            VALUES (v_uid, v_refund, 0)
            ON CONFLICT (user_id) DO UPDATE
            SET amount = public.balances.amount + EXCLUDED.amount,
                updated_at = now();
            INSERT INTO public.transactions (user_id, amount, type, description, reference_id)
            VALUES (v_uid, v_refund, 'membership_refund',
                    format('%s (საწევროს დაბრუნება)', coalesce(v_row.package_name, 'სეზონური საწევრო')),
                    v_row.id);
            v_refund_total := v_refund_total + v_refund;
          END IF;

          v_rows := v_rows || jsonb_build_object(
            'target_id', v_row.id, 'user_id', v_uid, 'display_name', v_profile.display_name,
            'outcome', 'changed', 'reason', NULL,
            'before', jsonb_build_object('status', v_row.status, 'starts_at', v_row.starts_at, 'expires_at', v_row.expires_at),
            'after', jsonb_build_object('status', v_after.status, 'starts_at', v_after.starts_at, 'expires_at', v_after.expires_at),
            'effects', jsonb_build_object('refund', v_refund, 'active_rentals', v_active_rentals));
          v_changed := v_changed + 1;
          v_user_changed := true;
        END LOOP;

        IF NOT v_user_changed AND p_subscription_id IS NULL THEN
          v_rows := v_rows || jsonb_build_object(
            'target_id', NULL, 'user_id', v_uid, 'display_name', v_profile.display_name,
            'outcome', 'skipped', 'reason', 'no_active_membership');
          v_skipped := v_skipped + 1;
          CONTINUE;
        END IF;
        IF v_user_changed THEN
          v_title := 'საწევრო გაუქმდა';
          v_message := 'თქვენი სეზონური საწევრო გაუქმდა.'
            || CASE WHEN v_refund_total > 0
                 THEN format(' %s ₾ დაბრუნდა თქვენს ბალანსზე.', v_refund_total) ELSE '' END;
        END IF;

      ELSE
        -- extend / shorten / set_end target the coverage row; set_period the given row.
        -- The live-row test is in the WHERE clause, so "not found" covers it.
        IF p_action = 'set_period' THEN
          SELECT s.* INTO v_row
          FROM public.user_subscriptions s
          WHERE s.id = p_subscription_id AND s.status = 'active' AND s.expires_at > now();
        ELSE
          SELECT s.* INTO v_row
          FROM public.user_subscriptions s
          WHERE s.user_id = v_uid AND s.status = 'active' AND s.expires_at > now()
          ORDER BY s.expires_at DESC, s.starts_at DESC, s.id DESC
          LIMIT 1;
        END IF;

        IF NOT FOUND THEN
          v_rows := v_rows || jsonb_build_object(
            'target_id', CASE WHEN p_action = 'set_period' THEN p_subscription_id END,
            'user_id', v_uid, 'display_name', v_profile.display_name,
            'outcome', 'skipped',
            'reason', CASE WHEN p_action = 'set_period' THEN 'not_live' ELSE 'no_active_membership' END);
          v_skipped := v_skipped + 1;
          CONTINUE;
        END IF;

        v_new_start := v_row.starts_at;
        v_new_end := v_row.expires_at;
        IF p_action = 'extend' THEN
          v_new_end := v_row.expires_at + make_interval(days => p_days);
        ELSIF p_action = 'shorten' THEN
          v_new_end := v_row.expires_at - make_interval(days => p_days);
        ELSIF p_action = 'set_end' THEN
          v_new_end := public._admin_status_day_end(p_end_date);
        ELSE
          IF p_start_date IS NOT NULL THEN
            v_new_start := public._admin_status_day_start(p_start_date);
          END IF;
          IF p_end_date IS NOT NULL THEN
            v_new_end := public._admin_status_day_end(p_end_date);
          END IF;
        END IF;

        v_reason := NULL;
        IF v_new_end <= v_new_start THEN
          v_reason := 'whole_period';
        ELSIF v_new_start = v_row.starts_at AND v_new_end = v_row.expires_at THEN
          v_reason := 'no_change';
        ELSE
          -- Never create or widen an overlap with another active/pending row.
          SELECT o.status INTO v_other
          FROM public.user_subscriptions o
          WHERE o.user_id = v_uid
            AND o.id <> v_row.id
            AND o.status IN ('active', 'pending_approval')
            AND public._admin_status_overlap_seconds(v_new_start, v_new_end, o.starts_at, o.expires_at)
                > public._admin_status_overlap_seconds(v_row.starts_at, v_row.expires_at, o.starts_at, o.expires_at)
          ORDER BY (o.status = 'pending_approval') DESC
          LIMIT 1;
          IF FOUND THEN
            v_reason := CASE WHEN v_other.status = 'pending_approval' THEN 'overlaps_pending' ELSE 'overlaps_existing' END;
          END IF;
        END IF;

        IF v_reason IS NOT NULL THEN
          v_rows := v_rows || jsonb_build_object(
            'target_id', v_row.id, 'user_id', v_uid, 'display_name', v_profile.display_name,
            'outcome', 'skipped', 'reason', v_reason,
            'before', jsonb_build_object('status', v_row.status, 'starts_at', v_row.starts_at, 'expires_at', v_row.expires_at),
            'after', jsonb_build_object('status', v_row.status, 'starts_at', v_new_start, 'expires_at', v_new_end));
          v_skipped := v_skipped + 1;
          CONTINUE;
        END IF;

        UPDATE public.user_subscriptions
        SET starts_at = v_new_start,
            expires_at = v_new_end
        WHERE id = v_row.id
        RETURNING id, status, starts_at, expires_at INTO v_after;

        v_covered_after := EXISTS (
          SELECT 1 FROM public.user_subscriptions s
          WHERE s.user_id = v_uid AND s.status = 'active'
            AND s.starts_at <= now() AND s.expires_at > now());
        v_rows := v_rows || jsonb_build_object(
          'target_id', v_row.id, 'user_id', v_uid, 'display_name', v_profile.display_name,
          'outcome', 'changed', 'reason', NULL,
          'before', jsonb_build_object('status', v_row.status, 'starts_at', v_row.starts_at, 'expires_at', v_row.expires_at),
          'after', jsonb_build_object('status', v_after.status, 'starts_at', v_after.starts_at, 'expires_at', v_after.expires_at),
          'effects', jsonb_build_object('covered_before', v_covered_before, 'covered_after', v_covered_after,
                                        'active_rentals', v_active_rentals));
        v_changed := v_changed + 1;
        v_user_changed := true;
        v_title := 'საწევრო განახლდა';
        v_message := CASE
          WHEN v_after.expires_at <= now() THEN 'თქვენი სეზონური საწევრო დასრულდა.'
          ELSE format('თქვენი სეზონური საწევრო მოქმედებს %s – %s.',
            public._admin_status_local_date(v_after.starts_at), public._admin_status_local_date(v_after.expires_at))
        END;
      END IF;

      IF p_action = 'revoke' AND v_user_changed THEN
        v_covered_after := EXISTS (
          SELECT 1 FROM public.user_subscriptions s
          WHERE s.user_id = v_uid AND s.status = 'active'
            AND s.starts_at <= now() AND s.expires_at > now());
        -- Every revoke row of this user carries the user's cover change.
        SELECT coalesce(jsonb_agg(
                 CASE WHEN e ->> 'user_id' = v_uid::text AND e ->> 'outcome' = 'changed'
                   THEN jsonb_set(e, '{effects}', (e -> 'effects') || jsonb_build_object(
                          'covered_before', v_covered_before, 'covered_after', v_covered_after))
                   ELSE e END ORDER BY ord), '[]'::jsonb)
          INTO v_rows
        FROM jsonb_array_elements(v_rows) WITH ORDINALITY AS x(e, ord);
      END IF;

      IF v_user_changed AND coalesce(p_notify, false) THEN
        PERFORM public._notify(
          v_uid,
          'membership_admin_update',
          v_title,
          v_message || CASE WHEN v_note IS NOT NULL THEN format(' შენიშვნა: %s', v_note) ELSE '' END,
          '/dashboard/renter',
          'renter'
        );
      END IF;
    END LOOP;

    IF coalesce(p_dry_run, true) THEN
      RAISE EXCEPTION 'ADMIN_STATUS_DRY_RUN' USING ERRCODE = 'MBDRY';
    END IF;
  EXCEPTION WHEN SQLSTATE 'MBDRY' THEN
    NULL; -- preview: every write above is rolled back, v_rows is kept
  END;

  RETURN jsonb_build_object(
    'applied', NOT coalesce(p_dry_run, true),
    'action', p_action,
    'changed', v_changed,
    'skipped', v_skipped,
    'rows', v_rows
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 6. Listing VIP / SUPER VIP and discount badge
-- ---------------------------------------------------------------------------
-- p_targets: [{"kind":"property"|"service","id":"<uuid>"}], 1..200.
-- VIP:      vip_grant(tier, days|end) only without an active tier;
--           vip_extend/vip_shorten(days), vip_set_end(date), vip_set_tier(tier),
--           vip_end act only on an active tier (view semantics).
-- Discount: discount_set(percent, days|end); discount_extend/shorten(days),
--           discount_set_end(date), discount_end on an active discount.
--           Food services use per-menu-item discounts (C21): skipped.
-- The UPDATEs only SET the six promotion columns, so the column-scoped
-- triggers (SMS dispatch lock, org rules, ownership basis) never fire.
CREATE OR REPLACE FUNCTION public.admin_change_listing_promotions(
  p_admin_id uuid,
  p_action text,
  p_targets jsonb,
  p_tier text DEFAULT NULL,
  p_days integer DEFAULT NULL,
  p_end_date date DEFAULT NULL,
  p_discount_percent integer DEFAULT NULL,
  p_notify boolean DEFAULT false,
  p_note text DEFAULT NULL,
  p_dry_run boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  c_actions CONSTANT text[] := ARRAY[
    'vip_grant', 'vip_extend', 'vip_shorten', 'vip_set_end', 'vip_set_tier', 'vip_end',
    'discount_set', 'discount_extend', 'discount_shorten', 'discount_set_end', 'discount_end'
  ];
  v_now timestamptz := now();
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_is_vip_action boolean := left(coalesce(p_action, ''), 4) = 'vip_';
  v_prop_ids uuid[];
  v_serv_ids uuid[];
  v_found_props uuid[] := ARRAY[]::uuid[];
  v_found_servs uuid[] := ARRAY[]::uuid[];
  v_target_count integer;
  v_l record;
  v_id uuid;
  v_tier_before text;
  v_tier_after text;
  v_disc_before boolean;
  v_disc_after boolean;
  n_vip boolean;
  n_super boolean;
  n_exp timestamptz;
  n_notified timestamptz;
  n_pct integer;
  n_dexp timestamptz;
  v_two_step boolean;
  a_vip boolean;
  a_super boolean;
  a_exp timestamptz;
  a_pct integer;
  a_dexp timestamptz;
  v_reason text;
  v_scope text;
  v_status_text text;
  v_notes jsonb := '[]'::jsonb;
  v_n record;
  v_rows jsonb := '[]'::jsonb;
  v_changed integer := 0;
  v_skipped integer := 0;
BEGIN
  PERFORM public._admin_status_require_admin(p_admin_id);

  IF p_action IS NULL OR NOT (p_action = ANY (c_actions)) THEN
    RAISE EXCEPTION 'ADMIN_STATUS_ACTION_INVALID' USING ERRCODE = '22023';
  END IF;
  IF v_note IS NOT NULL AND char_length(v_note) > 300 THEN
    RAISE EXCEPTION 'ADMIN_STATUS_NOTE_TOO_LONG' USING ERRCODE = '22023';
  END IF;

  IF p_targets IS NULL OR jsonb_typeof(p_targets) <> 'array' THEN
    RAISE EXCEPTION 'ADMIN_STATUS_TARGETS_INVALID' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_targets) e
    WHERE jsonb_typeof(e) <> 'object'
       OR coalesce(e ->> 'kind', '') NOT IN ('property', 'service')
       OR coalesce(e ->> 'id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  ) THEN
    RAISE EXCEPTION 'ADMIN_STATUS_TARGETS_INVALID' USING ERRCODE = '22023';
  END IF;
  SELECT coalesce(array_agg(DISTINCT (e ->> 'id')::uuid) FILTER (WHERE e ->> 'kind' = 'property'), ARRAY[]::uuid[]),
         coalesce(array_agg(DISTINCT (e ->> 'id')::uuid) FILTER (WHERE e ->> 'kind' = 'service'), ARRAY[]::uuid[])
    INTO v_prop_ids, v_serv_ids
  FROM jsonb_array_elements(p_targets) e;
  v_target_count := cardinality(v_prop_ids) + cardinality(v_serv_ids);
  IF v_target_count = 0 OR v_target_count > 200 THEN
    RAISE EXCEPTION 'ADMIN_STATUS_TARGETS_INVALID' USING ERRCODE = '22023';
  END IF;

  IF p_action IN ('vip_grant', 'discount_set') THEN
    IF (p_days IS NULL) = (p_end_date IS NULL) THEN
      RAISE EXCEPTION 'ADMIN_STATUS_PERIOD_REQUIRED' USING ERRCODE = '22023';
    END IF;
    IF p_days IS NOT NULL THEN
      PERFORM public._admin_status_check_days(p_days);
    ELSE
      PERFORM public._admin_status_check_end_date(p_end_date);
    END IF;
  ELSIF p_action IN ('vip_extend', 'vip_shorten', 'discount_extend', 'discount_shorten') THEN
    PERFORM public._admin_status_check_days(p_days);
  ELSIF p_action IN ('vip_set_end', 'discount_set_end') THEN
    PERFORM public._admin_status_check_end_date(p_end_date);
  END IF;
  IF p_action IN ('vip_grant', 'vip_set_tier') AND (p_tier IS NULL OR p_tier NOT IN ('vip', 'super')) THEN
    RAISE EXCEPTION 'ADMIN_STATUS_TIER_INVALID' USING ERRCODE = '22023';
  END IF;
  IF p_action = 'discount_set'
     AND (p_discount_percent IS NULL OR p_discount_percent < 1 OR p_discount_percent > 90) THEN
    RAISE EXCEPTION 'ADMIN_STATUS_PERCENT_INVALID' USING ERRCODE = '22023';
  END IF;

  BEGIN
    PERFORM 1 FROM public.properties WHERE id = ANY (v_prop_ids) ORDER BY id FOR UPDATE;
    PERFORM 1 FROM public.services WHERE id = ANY (v_serv_ids) ORDER BY id FOR UPDATE;

    FOR v_l IN
      SELECT 'property'::text AS kind, p.id, p.owner_id, p.title,
             p.is_vip, p.is_super_vip, p.vip_expires_at, p.vip_expiry_notified_at,
             coalesce(p.discount_percent, 0) AS discount_percent, p.discount_expires_at,
             true AS discount_applicable
      FROM public.properties p WHERE p.id = ANY (v_prop_ids)
      UNION ALL
      SELECT 'service'::text, s.id, s.owner_id, s.title,
             s.is_vip, s.is_super_vip, s.vip_expires_at, s.vip_expiry_notified_at,
             coalesce(s.discount_percent, 0), s.discount_expires_at,
             (s.category <> 'food')
      FROM public.services s WHERE s.id = ANY (v_serv_ids)
      ORDER BY 1, 2
    LOOP
      IF v_l.kind = 'property' THEN
        v_found_props := v_found_props || v_l.id;
      ELSE
        v_found_servs := v_found_servs || v_l.id;
      END IF;

      v_tier_before := CASE
        WHEN v_l.is_super_vip IS TRUE AND (v_l.vip_expires_at IS NULL OR v_l.vip_expires_at > now()) THEN 'super'
        WHEN v_l.is_vip IS TRUE AND (v_l.vip_expires_at IS NULL OR v_l.vip_expires_at > now()) THEN 'vip'
      END;
      v_disc_before := v_l.discount_applicable AND v_l.discount_percent > 0
        AND (v_l.discount_expires_at IS NULL OR v_l.discount_expires_at > now());

      n_vip := coalesce(v_l.is_vip, false);
      n_super := coalesce(v_l.is_super_vip, false);
      n_exp := v_l.vip_expires_at;
      n_notified := v_l.vip_expiry_notified_at;
      n_pct := v_l.discount_percent;
      n_dexp := v_l.discount_expires_at;
      v_two_step := false;
      v_reason := NULL;

      IF v_is_vip_action THEN
        IF p_action = 'vip_grant' THEN
          IF v_tier_before IS NOT NULL THEN
            v_reason := 'has_active_tier';
          ELSE
            n_super := (p_tier = 'super');
            n_vip := (p_tier = 'vip');
            n_exp := CASE WHEN p_days IS NOT NULL THEN v_now + make_interval(days => p_days)
                          ELSE public._admin_status_day_end(p_end_date) END;
            n_notified := NULL;
          END IF;
        ELSIF v_tier_before IS NULL THEN
          v_reason := 'not_active';
        ELSIF p_action IN ('vip_extend', 'vip_shorten') AND v_l.vip_expires_at IS NULL THEN
          v_reason := 'permanent_set_end_first';
        ELSIF p_action = 'vip_extend' THEN
          n_exp := v_l.vip_expires_at + make_interval(days => p_days);
          n_notified := NULL;
        ELSIF p_action = 'vip_shorten' THEN
          n_exp := v_l.vip_expires_at - make_interval(days => p_days);
          n_notified := NULL;
          IF n_exp <= v_now THEN
            n_vip := false;
            n_super := false;
          END IF;
        ELSIF p_action = 'vip_set_end' THEN
          n_exp := public._admin_status_day_end(p_end_date);
          n_notified := NULL;
          IF n_exp IS NOT DISTINCT FROM v_l.vip_expires_at THEN
            v_reason := 'no_change';
          END IF;
        ELSIF p_action = 'vip_set_tier' THEN
          IF v_tier_before = p_tier THEN
            v_reason := 'same_tier';
          ELSE
            n_super := (p_tier = 'super');
            n_vip := (p_tier = 'vip');
            -- enforce_listing_vip_tier_exclusivity raises 23P01 when is_vip
            -- turns on while SUPER is active: drop SUPER in its own UPDATE.
            v_two_step := (p_tier = 'vip');
          END IF;
        ELSIF p_action = 'vip_end' THEN
          n_vip := false;
          n_super := false;
          n_exp := least(coalesce(v_l.vip_expires_at, v_now), v_now);
        END IF;
      ELSE
        IF NOT v_l.discount_applicable THEN
          v_reason := 'food_menu_discounts';
        ELSIF p_action = 'discount_set' THEN
          n_pct := p_discount_percent;
          n_dexp := CASE WHEN p_days IS NOT NULL THEN v_now + make_interval(days => p_days)
                         ELSE public._admin_status_day_end(p_end_date) END;
        ELSIF NOT v_disc_before THEN
          v_reason := 'not_active';
        ELSIF p_action IN ('discount_extend', 'discount_shorten') AND v_l.discount_expires_at IS NULL THEN
          v_reason := 'permanent_set_end_first';
        ELSIF p_action = 'discount_extend' THEN
          n_dexp := v_l.discount_expires_at + make_interval(days => p_days);
        ELSIF p_action = 'discount_shorten' THEN
          n_dexp := v_l.discount_expires_at - make_interval(days => p_days);
          IF n_dexp <= v_now THEN
            n_pct := 0;
            n_dexp := NULL;
          END IF;
        ELSIF p_action = 'discount_set_end' THEN
          n_dexp := public._admin_status_day_end(p_end_date);
          IF n_dexp IS NOT DISTINCT FROM v_l.discount_expires_at THEN
            v_reason := 'no_change';
          END IF;
        ELSIF p_action = 'discount_end' THEN
          n_pct := 0;
          n_dexp := NULL;
        END IF;
      END IF;

      IF v_reason IS NOT NULL THEN
        v_rows := v_rows || jsonb_build_object(
          'kind', v_l.kind, 'target_id', v_l.id, 'owner_id', v_l.owner_id, 'title', v_l.title,
          'outcome', 'skipped', 'reason', v_reason,
          'before', jsonb_build_object('vip_tier', v_tier_before, 'vip_expires_at', v_l.vip_expires_at,
                                       'discount_percent', v_l.discount_percent,
                                       'discount_expires_at', v_l.discount_expires_at,
                                       'discount_active', v_disc_before));
        v_skipped := v_skipped + 1;
        CONTINUE;
      END IF;

      IF v_l.kind = 'property' THEN
        IF v_two_step THEN
          UPDATE public.properties SET is_super_vip = false, is_vip = false WHERE id = v_l.id;
        END IF;
        UPDATE public.properties
        SET is_vip = n_vip, is_super_vip = n_super,
            vip_expires_at = n_exp, vip_expiry_notified_at = n_notified,
            discount_percent = n_pct, discount_expires_at = n_dexp
        WHERE id = v_l.id
        RETURNING is_vip, is_super_vip, vip_expires_at, coalesce(discount_percent, 0), discount_expires_at
          INTO a_vip, a_super, a_exp, a_pct, a_dexp;
      ELSE
        IF v_two_step THEN
          UPDATE public.services SET is_super_vip = false, is_vip = false WHERE id = v_l.id;
        END IF;
        UPDATE public.services
        SET is_vip = n_vip, is_super_vip = n_super,
            vip_expires_at = n_exp, vip_expiry_notified_at = n_notified,
            discount_percent = n_pct, discount_expires_at = n_dexp
        WHERE id = v_l.id
        RETURNING is_vip, is_super_vip, vip_expires_at, coalesce(discount_percent, 0), discount_expires_at
          INTO a_vip, a_super, a_exp, a_pct, a_dexp;
      END IF;

      v_tier_after := CASE
        WHEN a_super IS TRUE AND (a_exp IS NULL OR a_exp > now()) THEN 'super'
        WHEN a_vip IS TRUE AND (a_exp IS NULL OR a_exp > now()) THEN 'vip'
      END;
      v_disc_after := v_l.discount_applicable AND a_pct > 0 AND (a_dexp IS NULL OR a_dexp > now());

      v_rows := v_rows || jsonb_build_object(
        'kind', v_l.kind, 'target_id', v_l.id, 'owner_id', v_l.owner_id, 'title', v_l.title,
        'outcome', 'changed', 'reason', NULL,
        'before', jsonb_build_object('vip_tier', v_tier_before, 'vip_expires_at', v_l.vip_expires_at,
                                     'discount_percent', v_l.discount_percent,
                                     'discount_expires_at', v_l.discount_expires_at,
                                     'discount_active', v_disc_before),
        'after', jsonb_build_object('vip_tier', v_tier_after, 'vip_expires_at', a_exp,
                                    'discount_percent', a_pct, 'discount_expires_at', a_dexp,
                                    'discount_active', v_disc_after));
      v_changed := v_changed + 1;

      IF coalesce(p_notify, false) AND v_l.owner_id IS NOT NULL THEN
        v_status_text := CASE
          WHEN v_is_vip_action THEN CASE
            WHEN v_tier_after IS NULL THEN 'VIP სტატუსი დასრულდა'
            WHEN a_exp IS NULL THEN format('%s აქტიურია', CASE v_tier_after WHEN 'super' THEN 'SUPER VIP' ELSE 'VIP' END)
            ELSE format('%s აქტიურია %s-მდე', CASE v_tier_after WHEN 'super' THEN 'SUPER VIP' ELSE 'VIP' END,
                        public._admin_status_local_datetime(a_exp))
          END
          ELSE CASE
            WHEN NOT v_disc_after THEN 'ფასდაკლება დასრულდა'
            WHEN a_dexp IS NULL THEN format('ფასდაკლება %s%% აქტიურია', a_pct)
            ELSE format('ფასდაკლება %s%% აქტიურია %s-მდე', a_pct, public._admin_status_local_datetime(a_dexp))
          END
        END;
        v_scope := public.dashboard_scope_for_listing(
          CASE WHEN v_l.kind = 'property' THEN v_l.id END,
          CASE WHEN v_l.kind = 'service' THEN v_l.id END,
          v_l.owner_id);
        v_notes := v_notes || jsonb_build_object(
          'owner_id', v_l.owner_id, 'scope', v_scope,
          'text', format('„%s“ — %s.', left(coalesce(v_l.title, ''), 80), v_status_text));
      END IF;
    END LOOP;

    FOREACH v_id IN ARRAY v_prop_ids LOOP
      CONTINUE WHEN v_id = ANY (v_found_props);
      v_rows := v_rows || jsonb_build_object('kind', 'property', 'target_id', v_id,
        'outcome', 'skipped', 'reason', 'listing_not_found');
      v_skipped := v_skipped + 1;
    END LOOP;
    FOREACH v_id IN ARRAY v_serv_ids LOOP
      CONTINUE WHEN v_id = ANY (v_found_servs);
      v_rows := v_rows || jsonb_build_object('kind', 'service', 'target_id', v_id,
        'outcome', 'skipped', 'reason', 'listing_not_found');
      v_skipped := v_skipped + 1;
    END LOOP;

    -- One notice per owner and cabinet.
    FOR v_n IN
      SELECT (n ->> 'owner_id')::uuid AS owner_id, n ->> 'scope' AS scope,
             count(*) AS listing_count, min(n ->> 'text') AS first_text
      FROM jsonb_array_elements(v_notes) n
      GROUP BY 1, 2
    LOOP
      PERFORM public._notify(
        v_n.owner_id,
        'promotion_admin_update',
        CASE WHEN v_is_vip_action THEN 'VIP სტატუსი განახლდა' ELSE 'ფასდაკლება განახლდა' END,
        CASE WHEN v_n.listing_count = 1 THEN v_n.first_text
             ELSE format('%s განცხადების %s შეიცვალა.', v_n.listing_count,
                         CASE WHEN v_is_vip_action THEN 'VIP სტატუსი' ELSE 'ფასდაკლება' END) END
          || CASE WHEN v_note IS NOT NULL THEN format(' შენიშვნა: %s', v_note) ELSE '' END,
        '/dashboard',
        v_n.scope
      );
    END LOOP;

    IF coalesce(p_dry_run, true) THEN
      RAISE EXCEPTION 'ADMIN_STATUS_DRY_RUN' USING ERRCODE = 'MBDRY';
    END IF;
  EXCEPTION WHEN SQLSTATE 'MBDRY' THEN
    NULL;
  END;

  RETURN jsonb_build_object(
    'applied', NOT coalesce(p_dry_run, true),
    'action', p_action,
    'changed', v_changed,
    'skipped', v_skipped,
    'rows', v_rows
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 7. Company plans
-- ---------------------------------------------------------------------------
-- grant(tier, days|end) only without a current plan and only for an active
-- organization; then auto-links the owner's sale listings like a purchase
-- (a failing link is reported, never fatal). extend/shorten(days),
-- set_end(date), set_tier(tier) and end act on the current plan.
CREATE OR REPLACE FUNCTION public.admin_change_company_plans(
  p_admin_id uuid,
  p_action text,
  p_org_ids uuid[],
  p_tier text DEFAULT NULL,
  p_days integer DEFAULT NULL,
  p_end_date date DEFAULT NULL,
  p_notify boolean DEFAULT false,
  p_note text DEFAULT NULL,
  p_dry_run boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  c_actions CONSTANT text[] := ARRAY['grant', 'extend', 'shorten', 'set_end', 'set_tier', 'end'];
  v_now timestamptz := now();
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_orgs uuid[];
  v_org_id uuid;
  v_org record;
  v_cur record;
  v_has_cur boolean;
  v_after record;
  v_pkg_limit integer;
  v_new_end timestamptz;
  v_new_status text;
  v_reason text;
  v_used integer;
  v_linked integer;
  v_link_error text;
  v_tier_name text;
  v_message text;
  v_rows jsonb := '[]'::jsonb;
  v_changed integer := 0;
  v_skipped integer := 0;
BEGIN
  PERFORM public._admin_status_require_admin(p_admin_id);

  IF p_action IS NULL OR NOT (p_action = ANY (c_actions)) THEN
    RAISE EXCEPTION 'ADMIN_STATUS_ACTION_INVALID' USING ERRCODE = '22023';
  END IF;
  IF v_note IS NOT NULL AND char_length(v_note) > 300 THEN
    RAISE EXCEPTION 'ADMIN_STATUS_NOTE_TOO_LONG' USING ERRCODE = '22023';
  END IF;
  SELECT coalesce(array_agg(DISTINCT o ORDER BY o), ARRAY[]::uuid[]) INTO v_orgs
  FROM unnest(coalesce(p_org_ids, ARRAY[]::uuid[])) AS o
  WHERE o IS NOT NULL;
  IF cardinality(v_orgs) = 0 OR cardinality(v_orgs) > 200 THEN
    RAISE EXCEPTION 'ADMIN_STATUS_TARGETS_INVALID' USING ERRCODE = '22023';
  END IF;

  IF p_action = 'grant' THEN
    IF (p_days IS NULL) = (p_end_date IS NULL) THEN
      RAISE EXCEPTION 'ADMIN_STATUS_PERIOD_REQUIRED' USING ERRCODE = '22023';
    END IF;
    IF p_days IS NOT NULL THEN
      PERFORM public._admin_status_check_days(p_days);
    ELSE
      PERFORM public._admin_status_check_end_date(p_end_date);
    END IF;
  ELSIF p_action IN ('extend', 'shorten') THEN
    PERFORM public._admin_status_check_days(p_days);
  ELSIF p_action = 'set_end' THEN
    PERFORM public._admin_status_check_end_date(p_end_date);
  END IF;
  IF p_action IN ('grant', 'set_tier') THEN
    IF p_tier IS NULL OR p_tier NOT IN ('entry', 'pro', 'premium', 'premium_plus') THEN
      RAISE EXCEPTION 'ADMIN_STATUS_TIER_INVALID' USING ERRCODE = '22023';
    END IF;
    SELECT NULLIF(meta ->> 'listing_limit', '')::integer
      INTO v_pkg_limit
    FROM public.pricing_packages
    WHERE category = 'subscription' AND code = 'company-' || p_tier;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'ADMIN_STATUS_PACKAGE_INVALID' USING ERRCODE = '22023';
    END IF;
  END IF;

  BEGIN
    PERFORM 1 FROM public.organizations WHERE id = ANY (v_orgs) ORDER BY id FOR UPDATE;
    PERFORM 1 FROM public.organization_subscriptions
    WHERE organization_id = ANY (v_orgs) ORDER BY id FOR UPDATE;

    FOREACH v_org_id IN ARRAY v_orgs LOOP
      SELECT id, brand_name, owner_id, status INTO v_org FROM public.organizations WHERE id = v_org_id;
      IF NOT FOUND THEN
        v_rows := v_rows || jsonb_build_object('target_id', v_org_id, 'outcome', 'skipped',
          'reason', 'company_not_found');
        v_skipped := v_skipped + 1;
        CONTINUE;
      END IF;

      SELECT s.* INTO v_cur
      FROM public.organization_subscriptions s
      WHERE s.organization_id = v_org_id AND s.status = 'active' AND s.expires_at > now()
      ORDER BY s.expires_at DESC, s.id DESC
      LIMIT 1;
      v_has_cur := FOUND;
      SELECT count(*)::integer INTO v_used FROM public.properties p WHERE p.organization_id = v_org_id;

      v_reason := NULL;
      v_linked := NULL;
      v_link_error := NULL;
      v_new_end := NULL;

      IF p_action = 'grant' THEN
        IF v_has_cur THEN
          v_reason := 'has_active_plan';
        ELSIF v_org.status <> 'active' THEN
          v_reason := 'company_not_active';
        END IF;
      ELSIF NOT v_has_cur THEN
        v_reason := 'no_active_plan';
      ELSIF p_action = 'set_tier' AND v_cur.tier = p_tier THEN
        v_reason := 'same_tier';
      ELSIF p_action IN ('shorten', 'set_end') THEN
        v_new_end := CASE WHEN p_action = 'shorten' THEN v_cur.expires_at - make_interval(days => p_days)
                          ELSE public._admin_status_day_end(p_end_date) END;
        IF v_new_end <= v_cur.starts_at THEN
          v_reason := 'whole_period';
        ELSIF v_new_end = v_cur.expires_at THEN
          v_reason := 'no_change';
        END IF;
      END IF;

      IF v_reason IS NOT NULL THEN
        v_rows := v_rows || jsonb_build_object(
          'target_id', v_org_id, 'brand_name', v_org.brand_name, 'owner_id', v_org.owner_id,
          'outcome', 'skipped', 'reason', v_reason,
          'before', CASE WHEN NOT v_has_cur THEN NULL ELSE jsonb_build_object(
            'tier', v_cur.tier, 'listing_limit', v_cur.listing_limit,
            'starts_at', v_cur.starts_at, 'expires_at', v_cur.expires_at, 'status', v_cur.status) END,
          'effects', jsonb_build_object('used_listings', v_used));
        v_skipped := v_skipped + 1;
        CONTINUE;
      END IF;

      IF p_action = 'grant' THEN
        UPDATE public.organization_subscriptions
        SET status = 'expired'
        WHERE organization_id = v_org_id AND status = 'active';
        INSERT INTO public.organization_subscriptions
          (organization_id, tier, listing_limit, amount_gel, starts_at, expires_at, status)
        VALUES (
          v_org_id, p_tier, v_pkg_limit, 0, v_now,
          CASE WHEN p_days IS NOT NULL THEN v_now + make_interval(days => p_days)
               ELSE public._admin_status_day_end(p_end_date) END,
          'active')
        RETURNING id, tier, listing_limit, starts_at, expires_at, status INTO v_after;
        BEGIN
          v_linked := public._auto_link_org_sale_listings(v_org_id, v_org.owner_id);
        EXCEPTION WHEN OTHERS THEN
          v_linked := 0;
          v_link_error := SQLERRM;
        END;
      ELSE
        v_new_status := v_cur.status;
        IF p_action = 'extend' THEN
          v_new_end := v_cur.expires_at + make_interval(days => p_days);
        ELSIF p_action = 'shorten' THEN
          IF v_new_end <= v_now THEN
            v_new_status := 'expired';
          END IF;
        ELSIF p_action = 'end' THEN
          v_new_end := least(v_cur.expires_at, v_now);
          v_new_status := 'cancelled';
        ELSIF p_action = 'set_tier' THEN
          v_new_end := v_cur.expires_at;
        END IF;

        UPDATE public.organization_subscriptions
        SET expires_at = v_new_end,
            status = v_new_status,
            tier = CASE WHEN p_action = 'set_tier' THEN p_tier ELSE tier END,
            listing_limit = CASE WHEN p_action = 'set_tier' THEN v_pkg_limit ELSE listing_limit END
        WHERE id = v_cur.id
        RETURNING id, tier, listing_limit, starts_at, expires_at, status INTO v_after;
      END IF;

      SELECT count(*)::integer INTO v_used FROM public.properties p WHERE p.organization_id = v_org_id;
      v_rows := v_rows || jsonb_build_object(
        'target_id', v_org_id, 'brand_name', v_org.brand_name, 'owner_id', v_org.owner_id,
        'outcome', 'changed', 'reason', NULL,
        'before', CASE WHEN NOT v_has_cur THEN NULL ELSE jsonb_build_object(
          'tier', v_cur.tier, 'listing_limit', v_cur.listing_limit,
          'starts_at', v_cur.starts_at, 'expires_at', v_cur.expires_at, 'status', v_cur.status) END,
        'after', jsonb_build_object(
          'tier', v_after.tier, 'listing_limit', v_after.listing_limit,
          'starts_at', v_after.starts_at, 'expires_at', v_after.expires_at, 'status', v_after.status),
        'effects', jsonb_build_object(
          'used_listings', v_used,
          'over_limit', (v_after.listing_limit IS NOT NULL AND v_used > v_after.listing_limit),
          'linked_listings', v_linked,
          'auto_link_error', v_link_error));
      v_changed := v_changed + 1;

      IF coalesce(p_notify, false) AND v_org.owner_id IS NOT NULL THEN
        SELECT name INTO v_tier_name FROM public.pricing_packages
        WHERE category = 'subscription' AND code = 'company-' || v_after.tier;
        v_message := CASE
          WHEN v_after.status <> 'active' OR v_after.expires_at <= now()
            THEN format('„%s“: კომპანიის პაკეტი დასრულდა.', v_org.brand_name)
          ELSE format('„%s“: %s პაკეტი მოქმედებს %s-მდე.', v_org.brand_name,
                      coalesce(v_tier_name, upper(v_after.tier)),
                      public._admin_status_local_date(v_after.expires_at))
        END;
        PERFORM public._notify(
          v_org.owner_id,
          'company_plan_admin_update',
          'კომპანიის პაკეტი განახლდა',
          v_message || CASE WHEN v_note IS NOT NULL THEN format(' შენიშვნა: %s', v_note) ELSE '' END,
          format('/dashboard/seller/organizations/%s', v_org_id),
          'seller'
        );
      END IF;
    END LOOP;

    IF coalesce(p_dry_run, true) THEN
      RAISE EXCEPTION 'ADMIN_STATUS_DRY_RUN' USING ERRCODE = 'MBDRY';
    END IF;
  EXCEPTION WHEN SQLSTATE 'MBDRY' THEN
    NULL;
  END;

  RETURN jsonb_build_object(
    'applied', NOT coalesce(p_dry_run, true),
    'action', p_action,
    'changed', v_changed,
    'skipped', v_skipped,
    'rows', v_rows
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_change_memberships(uuid, text, uuid[], uuid, integer, date, date, uuid, boolean, numeric, boolean, text, boolean)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_change_listing_promotions(uuid, text, jsonb, text, integer, date, integer, boolean, text, boolean)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_change_company_plans(uuid, text, uuid[], text, integer, date, boolean, text, boolean)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_change_memberships(uuid, text, uuid[], uuid, integer, date, date, uuid, boolean, numeric, boolean, text, boolean)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_change_listing_promotions(uuid, text, jsonb, text, integer, date, integer, boolean, text, boolean)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_change_company_plans(uuid, text, uuid[], text, integer, date, boolean, text, boolean)
  TO service_role;

COMMENT ON FUNCTION public.admin_change_memberships(uuid, text, uuid[], uuid, integer, date, date, uuid, boolean, numeric, boolean, text, boolean) IS
  'C44: admin membership change; p_dry_run computes the exact result and rolls it back.';
COMMENT ON FUNCTION public.admin_change_listing_promotions(uuid, text, jsonb, text, integer, date, integer, boolean, text, boolean) IS
  'C44: admin VIP / SUPER VIP / discount change; p_dry_run computes the exact result and rolls it back.';
COMMENT ON FUNCTION public.admin_change_company_plans(uuid, text, uuid[], text, integer, date, boolean, text, boolean) IS
  'C44: admin company plan change; p_dry_run computes the exact result and rolls it back.';
