-- 20261020120000_free_periods.sql
--
-- Admin free periods (contract C53): a standing, admin-editable rule "everyone who
-- registers between A and B (and has one of these roles) gets <benefit> until X".
--   benefit = membership | vip | super_vip
-- The rule is materialised as ordinary rows, so every existing gate, view and
-- dashboard keeps working unchanged:
--   * membership -> a user_subscriptions row (active, amount_paid 0, no
--                   transactions row, so it is never revenue; the same shape
--                   admin_change_memberships 'grant' writes, C44)
--   * vip        -> is_vip / is_super_vip + vip_expires_at on the owner's ACTIVE
--                   listings that have no active tier (C23, C44 vip_grant)
--
-- Who qualifies has ONE SQL definition (_free_period_member_candidates,
-- _free_period_listing_candidates). Three callers use it:
--   1. trigger profiles_free_period_grant (AFTER INSERT on profiles): the
--      registration moment; best-effort, can never fail a sign-up;
--   2. free_period_apply(): catch-up sweep for people who registered before the
--      period was saved, failed trigger runs, and ALL VIP application (there is
--      deliberately no trigger on properties/services, so the listing write path
--      and its guard triggers are untouched); chunked, single-flight per period,
--      run by pg_cron every 5 minutes and by the admin API after a save;
--   3. admin_free_period_stats(): the "waiting" counter on the admin page.
-- free_period_grants is the ledger: one row per grant, so a grant is never given
-- twice, never re-given after an admin revoked it, and an edit of the end date
-- re-dates only grants that are still live and still carry the date they were
-- granted with (a manual change by an admin or an owner's purchase wins).
--
-- Dates are Asia/Tbilisi calendar days (_admin_status_day_start/_end).
-- Both tables and every function are service_role only (C34); the admin API
-- (/api/admin/free-periods/**) is the only client of the tables.
--
-- Prod order: this migration (it also schedules free-period-apply-5min) BEFORE the app.

SET LOCAL search_path = public;
SET LOCAL lock_timeout = '10s';

-- ---------------------------------------------------------------------------
-- 0. Preflight: the objects this migration builds on (C44, C19, C37)
-- ---------------------------------------------------------------------------
DO $guard$
BEGIN
  IF to_regclass('public.admin_membership_overview_v') IS NULL THEN
    RAISE EXCEPTION 'free_periods: the C44 admin status migration (20261006120000) is missing' USING ERRCODE = '55000';
  END IF;
  IF to_regprocedure('public._notify(uuid,text,text,text,text,text)') IS NULL
     OR to_regprocedure('public.dashboard_scope_for_listing(uuid,uuid,uuid)') IS NULL
     OR to_regprocedure('public._admin_status_day_start(date)') IS NULL
     OR to_regprocedure('public._admin_status_day_end(date)') IS NULL
     OR to_regprocedure('public._admin_status_local_date(timestamptz)') IS NULL
     OR to_regprocedure('public._admin_status_require_admin(uuid)') IS NULL
     OR to_regprocedure('public.set_updated_at()') IS NULL
     OR to_regprocedure('public.audit_row_change()') IS NULL THEN
    RAISE EXCEPTION 'free_periods: a helper function is missing' USING ERRCODE = '55000';
  END IF;
  IF to_regclass('cron.job') IS NULL THEN
    RAISE EXCEPTION 'free_periods: pg_cron is not installed' USING ERRCODE = '55000';
  END IF;
END
$guard$;

-- ---------------------------------------------------------------------------
-- 1. Tables
-- ---------------------------------------------------------------------------
CREATE TABLE public.free_periods (
  id                     uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name                   text        NOT NULL,
  benefit                text        NOT NULL,
  registration_starts_at timestamptz NOT NULL,
  registration_ends_at   timestamptz NOT NULL,
  benefit_ends_at        timestamptz NOT NULL,
  roles                  public.user_role[] NOT NULL,
  max_listings           integer,
  is_active              boolean     NOT NULL DEFAULT true,
  created_by             uuid        REFERENCES public.profiles (id) ON DELETE SET NULL,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT free_periods_name_check
    CHECK (char_length(btrim(name)) BETWEEN 1 AND 80),
  CONSTRAINT free_periods_benefit_check
    CHECK (benefit IN ('membership', 'vip', 'super_vip')),
  CONSTRAINT free_periods_window_check
    CHECK (registration_ends_at > registration_starts_at),
  CONSTRAINT free_periods_benefit_end_check
    CHECK (benefit_ends_at >= registration_ends_at),
  CONSTRAINT free_periods_roles_check
    CHECK (cardinality(roles) >= 1
           AND array_position(roles, NULL) IS NULL
           AND NOT ('admin'::public.user_role = ANY (roles))),
  CONSTRAINT free_periods_max_listings_check
    CHECK (max_listings IS NULL OR (benefit <> 'membership' AND max_listings BETWEEN 1 AND 100))
);

COMMENT ON TABLE public.free_periods IS
  'C53: admin free period = registration window + roles + ONE benefit + end date. Written only by /api/admin/free-periods (service_role).';

CREATE TABLE public.free_period_grants (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  free_period_id     uuid        NOT NULL REFERENCES public.free_periods (id) ON DELETE CASCADE,
  user_id            uuid        NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  subscription_id    uuid        REFERENCES public.user_subscriptions (id) ON DELETE CASCADE,
  property_id        uuid        REFERENCES public.properties (id) ON DELETE CASCADE,
  service_id         uuid        REFERENCES public.services (id) ON DELETE CASCADE,
  granted_expires_at timestamptz NOT NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT free_period_grants_one_target_check
    CHECK (num_nonnulls(subscription_id, property_id, service_id) = 1)
);

COMMENT ON TABLE public.free_period_grants IS
  'C53: ledger, one row per grant (membership row or listing). granted_expires_at = the expiry the grant was last synced to.';

CREATE UNIQUE INDEX free_period_grants_member_uq
  ON public.free_period_grants (free_period_id, user_id) WHERE subscription_id IS NOT NULL;
CREATE UNIQUE INDEX free_period_grants_property_uq
  ON public.free_period_grants (free_period_id, property_id) WHERE property_id IS NOT NULL;
CREATE UNIQUE INDEX free_period_grants_service_uq
  ON public.free_period_grants (free_period_id, service_id) WHERE service_id IS NOT NULL;
CREATE INDEX free_period_grants_user_idx ON public.free_period_grants (user_id);
CREATE INDEX free_period_grants_subscription_idx
  ON public.free_period_grants (subscription_id) WHERE subscription_id IS NOT NULL;
CREATE INDEX free_period_grants_property_idx
  ON public.free_period_grants (property_id) WHERE property_id IS NOT NULL;
CREATE INDEX free_period_grants_service_idx
  ON public.free_period_grants (service_id) WHERE service_id IS NOT NULL;

CREATE TRIGGER set_free_periods_updated_at
  BEFORE UPDATE ON public.free_periods
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_audit_row
  AFTER INSERT OR UPDATE OR DELETE ON public.free_periods
  FOR EACH ROW EXECUTE FUNCTION public.audit_row_change();

-- RLS on with NO policy, no client grant (C34): the admin API uses the service role.
ALTER TABLE public.free_periods       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.free_period_grants ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.free_periods       FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.free_period_grants FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.free_periods       TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.free_period_grants TO service_role;

-- ---------------------------------------------------------------------------
-- 2. Guard: what an edit may not do (DB-level, so no writer can bypass it)
-- ---------------------------------------------------------------------------
--   * the benefit never changes (the ledger rows belong to one benefit);
--   * the end date is never in the past, and an ended period's end date is frozen
--     (to extend an ended offer create a new period: re-dating expired grants
--     would resurrect memberships and VIP the audience already lost).
CREATE OR REPLACE FUNCTION public.free_periods_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $fn$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.benefit_ends_at <= now() THEN
      RAISE EXCEPTION 'FREE_PERIOD_END_PAST' USING ERRCODE = '22023';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.benefit IS DISTINCT FROM OLD.benefit THEN
    RAISE EXCEPTION 'FREE_PERIOD_BENEFIT_LOCKED' USING ERRCODE = '22023';
  END IF;
  IF NEW.benefit_ends_at IS DISTINCT FROM OLD.benefit_ends_at THEN
    IF OLD.benefit_ends_at <= now() THEN
      RAISE EXCEPTION 'FREE_PERIOD_ENDED' USING ERRCODE = '22023';
    END IF;
    IF NEW.benefit_ends_at <= now() THEN
      RAISE EXCEPTION 'FREE_PERIOD_END_PAST' USING ERRCODE = '22023';
    END IF;
  END IF;
  RETURN NEW;
END;
$fn$;

CREATE TRIGGER free_periods_guard
  BEFORE INSERT OR UPDATE ON public.free_periods
  FOR EACH ROW EXECUTE FUNCTION public.free_periods_guard();

REVOKE ALL ON FUNCTION public.free_periods_guard() FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Who qualifies: ONE definition
-- ---------------------------------------------------------------------------
-- Members: registered inside the window with an eligible role, not granted by this
-- period yet, and no live active/pending membership overlapping [now, X] (C44
-- never overlaps). p_user narrows to one profile (the trigger path).
CREATE OR REPLACE FUNCTION public._free_period_member_candidates(
  p_period uuid,
  p_user   uuid DEFAULT NULL
)
RETURNS TABLE (member_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $fn$
  SELECT p.id
  FROM public.free_periods fp
  JOIN public.profiles p
    ON p.created_at >= fp.registration_starts_at
   AND p.created_at <= fp.registration_ends_at
   AND p.role = ANY (fp.roles)
  WHERE fp.id = p_period
    AND fp.benefit = 'membership'
    AND fp.benefit_ends_at > now()
    AND (p_user IS NULL OR p.id = p_user)
    AND NOT EXISTS (
      SELECT 1 FROM public.free_period_grants g
      WHERE g.free_period_id = fp.id AND g.user_id = p.id AND g.subscription_id IS NOT NULL)
    AND NOT EXISTS (
      SELECT 1 FROM public.user_subscriptions s
      WHERE s.user_id = p.id
        AND s.status IN ('active', 'pending_approval')
        AND s.starts_at < fp.benefit_ends_at
        AND s.expires_at > now())
  ORDER BY p.id;
$fn$;

-- Listings: ACTIVE listings of owners who registered inside the window with an
-- eligible role, with no active tier (C44 vip_grant: a paid tier always wins), not
-- granted by this period yet, and within max_listings per owner (oldest first,
-- counting the listings this period already granted). p_owner narrows to one owner
-- (the cap still ranks all of that owner's eligible listings).
CREATE OR REPLACE FUNCTION public._free_period_listing_candidates(
  p_period uuid,
  p_owner  uuid DEFAULT NULL
)
RETURNS TABLE (l_kind text, l_id uuid, l_owner uuid)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $fn$
  WITH fp AS (
    SELECT * FROM public.free_periods
    WHERE id = p_period AND benefit IN ('vip', 'super_vip') AND benefit_ends_at > now()
  ),
  listing AS (
    SELECT 'property'::text AS kind, pr.id, pr.owner_id, pr.created_at,
           pr.is_vip, pr.is_super_vip, pr.vip_expires_at
    FROM public.properties pr
    WHERE pr.status = 'active' AND (p_owner IS NULL OR pr.owner_id = p_owner)
    UNION ALL
    SELECT 'service'::text, s.id, s.owner_id, s.created_at,
           s.is_vip, s.is_super_vip, s.vip_expires_at
    FROM public.services s
    WHERE s.status = 'active' AND (p_owner IS NULL OR s.owner_id = p_owner)
  ),
  eligible AS (
    SELECT l.kind, l.id, l.owner_id, l.created_at
    FROM listing l
    CROSS JOIN fp
    JOIN public.profiles o ON o.id = l.owner_id
    WHERE o.created_at >= fp.registration_starts_at
      AND o.created_at <= fp.registration_ends_at
      AND o.role = ANY (fp.roles)
      AND NOT (coalesce(l.is_super_vip, false) AND (l.vip_expires_at IS NULL OR l.vip_expires_at > now()))
      AND NOT (coalesce(l.is_vip, false)       AND (l.vip_expires_at IS NULL OR l.vip_expires_at > now()))
      AND NOT EXISTS (
        SELECT 1 FROM public.free_period_grants g
        WHERE g.free_period_id = fp.id
          AND ((l.kind = 'property' AND g.property_id = l.id)
            OR (l.kind = 'service'  AND g.service_id  = l.id)))
  ),
  ranked AS (
    SELECT e.kind, e.id, e.owner_id, e.created_at,
           row_number() OVER (PARTITION BY e.owner_id ORDER BY e.created_at, e.id) AS rn,
           (SELECT count(*) FROM public.free_period_grants g
             WHERE g.free_period_id = p_period AND g.user_id = e.owner_id
               AND g.subscription_id IS NULL) AS already
    FROM eligible e
  )
  SELECT r.kind, r.id, r.owner_id
  FROM ranked r
  CROSS JOIN fp
  WHERE fp.max_listings IS NULL OR r.rn + r.already <= fp.max_listings
  ORDER BY r.owner_id, r.created_at, r.id;
$fn$;

REVOKE ALL ON FUNCTION public._free_period_member_candidates(uuid, uuid)  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._free_period_listing_candidates(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Granting one membership / one listing (called under the purchase paths' locks)
-- ---------------------------------------------------------------------------
-- Takes the same advisory lock as purchase_renter_membership and
-- admin_change_memberships, then re-checks eligibility through the SAME candidate
-- function, so a purchase that landed first turns this into 'not_eligible'.
CREATE OR REPLACE FUNCTION public._free_period_grant_membership(p_period uuid, p_user uuid)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
SET lock_timeout = '3s'
AS $fn$
DECLARE
  v_fp  public.free_periods%ROWTYPE;
  v_sub uuid;
  v_n   integer;
BEGIN
  SELECT * INTO v_fp FROM public.free_periods WHERE id = p_period;
  IF NOT FOUND OR NOT v_fp.is_active OR v_fp.benefit <> 'membership' OR v_fp.benefit_ends_at <= now() THEN
    RETURN 'inactive';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('renter-membership:' || p_user::text, 0));

  IF NOT EXISTS (SELECT 1 FROM public._free_period_member_candidates(p_period, p_user)) THEN
    RETURN 'not_eligible';
  END IF;

  INSERT INTO public.user_subscriptions (
    user_id, package_id, starts_at, expires_at, status, amount_paid,
    reviewed_by, reviewed_at, review_note
  ) VALUES (
    p_user, NULL, now(), v_fp.benefit_ends_at, 'active', 0,
    v_fp.created_by, now(), format('უფასო პერიოდი: %s', v_fp.name)
  )
  RETURNING id INTO v_sub;

  INSERT INTO public.free_period_grants (free_period_id, user_id, subscription_id, granted_expires_at)
  VALUES (p_period, p_user, v_sub, v_fp.benefit_ends_at)
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> 1 THEN
    -- Cannot happen under the lock + candidate check; never keep a row the ledger lacks.
    RAISE EXCEPTION 'FREE_PERIOD_LEDGER_CONFLICT' USING ERRCODE = '23505';
  END IF;

  PERFORM public._notify(
    p_user,
    'membership_admin_update',
    'უფასო საწევრო მოგენიჭათ',
    format('თქვენი უფასო საწევრო აქტიურია %s-მდე.', public._admin_status_local_date(v_fp.benefit_ends_at)),
    '/dashboard/renter',
    'renter'
  );
  RETURN 'granted';
END;
$fn$;

-- Locks the listing row, re-checks eligibility through the candidate function, sets
-- the tier and writes the ledger row. Only the four promotion columns it needs are
-- SET, so the column-scoped triggers (SMS dispatch lock, org rules, ownership basis)
-- never fire; the caller is service_role or pg_cron, which the guard triggers pass.
CREATE OR REPLACE FUNCTION public._free_period_grant_listing(p_period uuid, p_kind text, p_listing uuid)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
SET lock_timeout = '3s'
AS $fn$
DECLARE
  v_fp    public.free_periods%ROWTYPE;
  v_owner uuid;
BEGIN
  SELECT * INTO v_fp FROM public.free_periods WHERE id = p_period;
  IF NOT FOUND OR NOT v_fp.is_active OR v_fp.benefit NOT IN ('vip', 'super_vip') OR v_fp.benefit_ends_at <= now() THEN
    RETURN 'inactive';
  END IF;

  IF p_kind = 'property' THEN
    SELECT owner_id INTO v_owner FROM public.properties WHERE id = p_listing FOR UPDATE;
  ELSIF p_kind = 'service' THEN
    SELECT owner_id INTO v_owner FROM public.services WHERE id = p_listing FOR UPDATE;
  ELSE
    RETURN 'not_found';
  END IF;
  IF v_owner IS NULL THEN
    RETURN 'not_found';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public._free_period_listing_candidates(p_period, v_owner) c
    WHERE c.l_kind = p_kind AND c.l_id = p_listing
  ) THEN
    RETURN 'not_eligible';
  END IF;

  IF p_kind = 'property' THEN
    UPDATE public.properties
    SET is_vip = (v_fp.benefit = 'vip'), is_super_vip = (v_fp.benefit = 'super_vip'),
        vip_expires_at = v_fp.benefit_ends_at, vip_expiry_notified_at = NULL
    WHERE id = p_listing;
    INSERT INTO public.free_period_grants (free_period_id, user_id, property_id, granted_expires_at)
    VALUES (p_period, v_owner, p_listing, v_fp.benefit_ends_at);
  ELSE
    UPDATE public.services
    SET is_vip = (v_fp.benefit = 'vip'), is_super_vip = (v_fp.benefit = 'super_vip'),
        vip_expires_at = v_fp.benefit_ends_at, vip_expiry_notified_at = NULL
    WHERE id = p_listing;
    INSERT INTO public.free_period_grants (free_period_id, user_id, service_id, granted_expires_at)
    VALUES (p_period, v_owner, p_listing, v_fp.benefit_ends_at);
  END IF;
  RETURN 'granted';
END;
$fn$;

REVOKE ALL ON FUNCTION public._free_period_grant_membership(uuid, uuid)      FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._free_period_grant_listing(uuid, text, uuid)   FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. Registration trigger (membership only)
-- ---------------------------------------------------------------------------
-- Runs inside the registrant's own INSERT as authenticated, so it is DEFINER and
-- best-effort: any error is a WARNING and the sign-up goes through (the sweep catches
-- the person up within 5 minutes). lock_timeout (function-level, 3 s like the grant
-- helpers) keeps a lock wait below the API roles' statement_timeout, whose 57014
-- would escape the handler.
-- Several matching periods: the longest end wins, the rest skip on overlap.
CREATE OR REPLACE FUNCTION public.free_period_on_profile_insert()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
SET lock_timeout = '3s'
AS $fn$
DECLARE
  r record;
BEGIN
  IF NEW.role = 'admin' THEN
    RETURN NEW;
  END IF;
  BEGIN
    FOR r IN
      SELECT fp.id
      FROM public.free_periods fp
      WHERE fp.is_active AND fp.benefit = 'membership' AND fp.benefit_ends_at > now()
      ORDER BY fp.benefit_ends_at DESC, fp.created_at, fp.id
    LOOP
      EXIT WHEN public._free_period_grant_membership(r.id, NEW.id) = 'granted';
    END LOOP;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'free_period_on_profile_insert: % (%)', SQLERRM, SQLSTATE;
  END;
  RETURN NEW;
END;
$fn$;

CREATE TRIGGER profiles_free_period_grant
  AFTER INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.free_period_on_profile_insert();

REVOKE ALL ON FUNCTION public.free_period_on_profile_insert() FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 6. Sweep: re-date, then grant (chunked)
-- ---------------------------------------------------------------------------
-- At most p_limit rows per call (default 200, the C44 cap): one advisory lock per
-- membership user and one row lock per listing stay far below the shared lock-table
-- limit. Single-flight per period. Returns
--   {state, granted_members, granted_listings, redated, skipped, remaining}
-- state: running | paused | ended | busy. `remaining` > 0 means call again.
CREATE OR REPLACE FUNCTION public.free_period_apply(p_period uuid, p_limit integer DEFAULT 200)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  v_fp       public.free_periods%ROWTYPE;
  v_budget   integer;
  v_gm       integer := 0;
  v_gl       integer := 0;
  v_rd       integer := 0;
  v_sk       integer := 0;
  v_rem      integer;
  v_n        integer;
  v_out      text;
  v_notes    jsonb := '[]'::jsonb;
  v_label    text;
  v_date     text;
  r          record;
BEGIN
  SELECT * INTO v_fp FROM public.free_periods WHERE id = p_period;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'FREE_PERIOD_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  IF NOT v_fp.is_active THEN
    RETURN jsonb_build_object('state', 'paused', 'granted_members', 0, 'granted_listings', 0,
                              'redated', 0, 'skipped', 0, 'remaining', 0);
  END IF;
  IF v_fp.benefit_ends_at <= now() THEN
    RETURN jsonb_build_object('state', 'ended', 'granted_members', 0, 'granted_listings', 0,
                              'redated', 0, 'skipped', 0, 'remaining', 0);
  END IF;
  IF NOT pg_try_advisory_xact_lock(hashtextextended('free-period-apply:' || p_period::text, 0)) THEN
    RETURN jsonb_build_object('state', 'busy', 'granted_members', 0, 'granted_listings', 0,
                              'redated', 0, 'skipped', 0, 'remaining', 0);
  END IF;
  v_budget := greatest(1, least(coalesce(p_limit, 200), 500));

  IF v_fp.benefit = 'membership' THEN
    -- 1a. Re-date live grants that still carry the date they were granted with.
    FOR r IN
      SELECT g.id AS gid, g.user_id, s.id AS sid, s.expires_at AS cur_end
      FROM public.free_period_grants g
      JOIN public.user_subscriptions s ON s.id = g.subscription_id
      WHERE g.free_period_id = p_period AND g.subscription_id IS NOT NULL
        AND g.granted_expires_at <> v_fp.benefit_ends_at
        AND s.status = 'active' AND s.expires_at = g.granted_expires_at AND s.expires_at > now()
      ORDER BY g.user_id, g.id
      LIMIT v_budget
    LOOP
      v_budget := v_budget - 1;
      BEGIN
        PERFORM pg_advisory_xact_lock(hashtextextended('renter-membership:' || r.user_id::text, 0));
        IF v_fp.benefit_ends_at > r.cur_end AND EXISTS (
          SELECT 1 FROM public.user_subscriptions o
          WHERE o.user_id = r.user_id AND o.id <> r.sid
            AND o.status IN ('active', 'pending_approval')
            AND o.starts_at < v_fp.benefit_ends_at AND o.expires_at > r.cur_end
        ) THEN
          -- Extending would overlap another membership: leave the row, stop retrying it.
          UPDATE public.free_period_grants SET granted_expires_at = v_fp.benefit_ends_at WHERE id = r.gid;
          v_sk := v_sk + 1;
          CONTINUE;
        END IF;
        UPDATE public.user_subscriptions
        SET expires_at = v_fp.benefit_ends_at
        WHERE id = r.sid AND status = 'active' AND expires_at = r.cur_end
          AND starts_at < v_fp.benefit_ends_at;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n = 1 THEN
          UPDATE public.free_period_grants SET granted_expires_at = v_fp.benefit_ends_at WHERE id = r.gid;
          v_rd := v_rd + 1;
        ELSE
          v_sk := v_sk + 1;
        END IF;
      EXCEPTION
        WHEN lock_not_available OR deadlock_detected THEN
          v_sk := v_sk + 1;
        WHEN OTHERS THEN
          -- One bad row must never abort the chunk (it would be first in line again on every sweep).
          RAISE WARNING 'free_period_apply: re-date of grant % failed: % (%)', r.gid, SQLERRM, SQLSTATE;
          v_sk := v_sk + 1;
      END;
    END LOOP;

    -- 1b. Grant to everyone who qualifies now.
    FOR r IN
      SELECT c.member_id FROM public._free_period_member_candidates(p_period) c LIMIT v_budget
    LOOP
      BEGIN
        v_out := public._free_period_grant_membership(p_period, r.member_id);
      EXCEPTION
        WHEN lock_not_available OR deadlock_detected THEN
          v_out := 'busy';
        WHEN OTHERS THEN
          RAISE WARNING 'free_period_apply: grant of period % to user % failed: % (%)', p_period, r.member_id, SQLERRM, SQLSTATE;
          v_out := 'failed';
      END;
      IF v_out = 'granted' THEN v_gm := v_gm + 1; ELSE v_sk := v_sk + 1; END IF;
    END LOOP;

    SELECT (SELECT count(*) FROM public._free_period_member_candidates(p_period))
         + (SELECT count(*)
            FROM public.free_period_grants g
            JOIN public.user_subscriptions s ON s.id = g.subscription_id
            WHERE g.free_period_id = p_period AND g.subscription_id IS NOT NULL
              AND g.granted_expires_at <> v_fp.benefit_ends_at
              AND s.status = 'active' AND s.expires_at = g.granted_expires_at AND s.expires_at > now())
      INTO v_rem;
  ELSE
    -- 2a. Re-date live listing grants that still carry the date they were granted with.
    FOR r IN
      SELECT g.id AS gid, g.property_id, g.service_id, g.granted_expires_at AS old_end
      FROM public.free_period_grants g
      LEFT JOIN public.properties p ON p.id = g.property_id
      LEFT JOIN public.services   s ON s.id = g.service_id
      WHERE g.free_period_id = p_period AND g.subscription_id IS NULL
        AND g.granted_expires_at <> v_fp.benefit_ends_at
        AND coalesce(p.vip_expires_at, s.vip_expires_at) = g.granted_expires_at
        AND coalesce(p.vip_expires_at, s.vip_expires_at) > now()
        AND (coalesce(p.is_vip, s.is_vip, false) OR coalesce(p.is_super_vip, s.is_super_vip, false))
      ORDER BY g.id
      LIMIT v_budget
    LOOP
      v_budget := v_budget - 1;
      BEGIN
        IF r.property_id IS NOT NULL THEN
          UPDATE public.properties
          SET vip_expires_at = v_fp.benefit_ends_at, vip_expiry_notified_at = NULL
          WHERE id = r.property_id AND vip_expires_at = r.old_end;
        ELSE
          UPDATE public.services
          SET vip_expires_at = v_fp.benefit_ends_at, vip_expiry_notified_at = NULL
          WHERE id = r.service_id AND vip_expires_at = r.old_end;
        END IF;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n = 1 THEN
          UPDATE public.free_period_grants SET granted_expires_at = v_fp.benefit_ends_at WHERE id = r.gid;
          v_rd := v_rd + 1;
        ELSE
          v_sk := v_sk + 1;
        END IF;
      EXCEPTION
        WHEN lock_not_available OR deadlock_detected THEN
          v_sk := v_sk + 1;
        WHEN OTHERS THEN
          -- One bad row must never abort the chunk (it would be first in line again on every sweep).
          RAISE WARNING 'free_period_apply: re-date of grant % failed: % (%)', r.gid, SQLERRM, SQLSTATE;
          v_sk := v_sk + 1;
      END;
    END LOOP;

    -- 2b. Grant to every active listing that qualifies now.
    FOR r IN
      SELECT c.l_kind, c.l_id, c.l_owner
      FROM public._free_period_listing_candidates(p_period) c LIMIT v_budget
    LOOP
      BEGIN
        v_out := public._free_period_grant_listing(p_period, r.l_kind, r.l_id);
      EXCEPTION
        WHEN lock_not_available OR deadlock_detected THEN
          v_out := 'busy';
        WHEN OTHERS THEN
          RAISE WARNING 'free_period_apply: grant of period % to % % failed: % (%)', p_period, r.l_kind, r.l_id, SQLERRM, SQLSTATE;
          v_out := 'failed';
      END;
      IF v_out = 'granted' THEN
        v_gl := v_gl + 1;
        v_notes := v_notes || jsonb_build_object(
          'owner_id', r.l_owner,
          'scope', public.dashboard_scope_for_listing(
            CASE WHEN r.l_kind = 'property' THEN r.l_id END,
            CASE WHEN r.l_kind = 'service'  THEN r.l_id END,
            r.l_owner));
      ELSE
        v_sk := v_sk + 1;
      END IF;
    END LOOP;

    -- One notice per owner and cabinet (fixed text only; no admin-typed text).
    v_label := CASE v_fp.benefit WHEN 'super_vip' THEN 'SUPER VIP' ELSE 'VIP' END;
    v_date  := public._admin_status_local_date(v_fp.benefit_ends_at);
    FOR r IN
      SELECT (n ->> 'owner_id')::uuid AS owner_id, n ->> 'scope' AS scope, count(*)::integer AS cnt
      FROM jsonb_array_elements(v_notes) n
      GROUP BY 1, 2
    LOOP
      PERFORM public._notify(
        r.owner_id,
        'promotion_admin_update',
        format('უფასო %s მოგენიჭათ', v_label),
        CASE WHEN r.cnt = 1
             THEN format('თქვენს განცხადებას მიენიჭა უფასო %s %s-მდე.', v_label, v_date)
             ELSE format('თქვენს %s განცხადებას მიენიჭა უფასო %s %s-მდე.', r.cnt, v_label, v_date) END,
        '/dashboard',
        r.scope);
    END LOOP;

    SELECT (SELECT count(*) FROM public._free_period_listing_candidates(p_period))
         + (SELECT count(*)
            FROM public.free_period_grants g
            LEFT JOIN public.properties p ON p.id = g.property_id
            LEFT JOIN public.services   s ON s.id = g.service_id
            WHERE g.free_period_id = p_period AND g.subscription_id IS NULL
              AND g.granted_expires_at <> v_fp.benefit_ends_at
              AND coalesce(p.vip_expires_at, s.vip_expires_at) = g.granted_expires_at
              AND coalesce(p.vip_expires_at, s.vip_expires_at) > now()
              AND (coalesce(p.is_vip, s.is_vip, false) OR coalesce(p.is_super_vip, s.is_super_vip, false)))
      INTO v_rem;
  END IF;

  RETURN jsonb_build_object('state', 'running', 'granted_members', v_gm, 'granted_listings', v_gl,
                            'redated', v_rd, 'skipped', v_sk, 'remaining', v_rem);
END;
$fn$;

-- pg_cron entry: every running period, one chunk each; one bad period never blocks the rest.
CREATE OR REPLACE FUNCTION public.free_period_apply_all(p_limit integer DEFAULT 200)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  r record;
  v_done integer := 0;
BEGIN
  FOR r IN
    SELECT id FROM public.free_periods
    WHERE is_active AND benefit_ends_at > now()
    ORDER BY created_at, id
  LOOP
    BEGIN
      PERFORM public.free_period_apply(r.id, p_limit);
      v_done := v_done + 1;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'free_period_apply_all: period % failed: % (%)', r.id, SQLERRM, SQLSTATE;
    END;
  END LOOP;
  RETURN jsonb_build_object('periods', v_done);
END;
$fn$;

REVOKE ALL ON FUNCTION public.free_period_apply(uuid, integer)  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.free_period_apply_all(integer)    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.free_period_apply(uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.free_period_apply_all(integer)   TO service_role;

COMMENT ON FUNCTION public.free_period_apply(uuid, integer) IS
  'C53: re-date + grant sweep for one free period (service_role + pg_cron only).';

-- ---------------------------------------------------------------------------
-- 7. Admin counters (granted / waiting per period)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_free_period_stats(p_admin_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = ''
AS $fn$
BEGIN
  PERFORM public._admin_status_require_admin(p_admin_id);
  RETURN (
    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'id', fp.id,
      'granted_members',  (SELECT count(*) FROM public.free_period_grants g
                            WHERE g.free_period_id = fp.id AND g.subscription_id IS NOT NULL),
      'granted_listings', (SELECT count(*) FROM public.free_period_grants g
                            WHERE g.free_period_id = fp.id AND g.subscription_id IS NULL),
      'waiting', CASE fp.benefit
                   WHEN 'membership' THEN (SELECT count(*) FROM public._free_period_member_candidates(fp.id))
                   ELSE (SELECT count(*) FROM public._free_period_listing_candidates(fp.id))
                 END
    ) ORDER BY fp.created_at DESC, fp.id), '[]'::jsonb)
    FROM public.free_periods fp
  );
END;
$fn$;

REVOKE ALL ON FUNCTION public.admin_free_period_stats(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_free_period_stats(uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- 8. Schedule (SQL-only: no timeout needed, C4)
-- ---------------------------------------------------------------------------
DO $cron$
BEGIN
  PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'free-period-apply-5min';
  PERFORM cron.schedule('free-period-apply-5min', '*/5 * * * *', $job$select public.free_period_apply_all();$job$);
END
$cron$;

NOTIFY pgrst, 'reload schema';

-- DOWN (manual):
--   SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'free-period-apply-5min';
--   DROP TRIGGER profiles_free_period_grant ON public.profiles;
--   DROP FUNCTION public.admin_free_period_stats(uuid), public.free_period_apply_all(integer),
--     public.free_period_apply(uuid, integer), public.free_period_on_profile_insert(),
--     public._free_period_grant_listing(uuid, text, uuid), public._free_period_grant_membership(uuid, uuid),
--     public._free_period_listing_candidates(uuid, uuid), public._free_period_member_candidates(uuid, uuid);
--   DROP TABLE public.free_period_grants, public.free_periods;   -- then DROP FUNCTION public.free_periods_guard();
--   (granted user_subscriptions rows / listing VIP flags stay; revoke them from /dashboard/admin/statuses.)
