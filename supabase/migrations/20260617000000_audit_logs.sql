-- Admin audit logs (ლოგები)
--
-- One generic AFTER-row trigger records every meaningful INSERT/UPDATE/DELETE on
-- 34 public tables into public.audit_logs, plus a login trigger on auth.users
-- (auth.audit_log_entries is empty on this project, so logins are not otherwise
-- queryable). All trigger bodies are exception-swallowed (RAISE WARNING) so an
-- audit failure can NEVER roll back the parent write or break login. Admins read
-- the table through RLS (is_admin_user()); nobody else can see or write it.
--
-- Actor attribution:
--   * browser writes carry auth.uid()                            -> actor_source 'user'
--   * Next.js admin API routes send an x-actor-id header on the
--     service-role client; trusted ONLY when the request JWT role
--     is service_role (anyone can send the header, only the
--     service key can't be forged)                               -> actor_source 'admin'
--   * edge functions / cron (service-role, no header)            -> actor_source 'system'
--
-- Noise control: updates touching only counter/bookkeeping columns (views_count
-- etc. — increment_views fires on every detail-page view) are skipped entirely;
-- bulky payload columns (photos, menu, ...) are stripped from snapshots.
--
-- DOWN / rollback (run manually if reverting):
--   DROP TRIGGER IF EXISTS trg_audit_login ON auth.users;
--   DROP FUNCTION IF EXISTS public.audit_login();
--   DO $$ DECLARE r record; BEGIN
--     FOR r IN SELECT c.relname FROM pg_trigger tg JOIN pg_class c ON c.oid = tg.tgrelid
--              WHERE tg.tgname = 'trg_audit_row'
--     LOOP EXECUTE format('DROP TRIGGER trg_audit_row ON public.%I', r.relname); END LOOP;
--   END $$;
--   DROP FUNCTION IF EXISTS public.audit_row_change();
--   DROP TABLE IF EXISTS public.audit_logs;

-- === Table ===

CREATE TABLE public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  table_name text NOT NULL,
  operation text NOT NULL CHECK (operation IN ('INSERT', 'UPDATE', 'DELETE', 'LOGIN')),
  record_id uuid,
  actor_id uuid,
  actor_source text NOT NULL DEFAULT 'system' CHECK (actor_source IN ('user', 'admin', 'system')),
  subject_user_id uuid,
  property_id uuid,
  service_id uuid,
  changed_fields text[],
  old_values jsonb,
  new_values jsonb
);

COMMENT ON TABLE public.audit_logs IS
  'Admin-only audit trail. Populated by trg_audit_row / trg_audit_login. No FKs on purpose: rows must survive deletion of what they describe.';

-- id DESC participates in every index: rows written in one transaction share now(),
-- so keyset pagination needs the (occurred_at, id) composite ordering.
CREATE INDEX audit_logs_time_idx     ON public.audit_logs (occurred_at DESC, id DESC);
CREATE INDEX audit_logs_subject_idx  ON public.audit_logs (subject_user_id, occurred_at DESC, id DESC);
CREATE INDEX audit_logs_property_idx ON public.audit_logs (property_id, occurred_at DESC, id DESC);
CREATE INDEX audit_logs_service_idx  ON public.audit_logs (service_id, occurred_at DESC, id DESC);
CREATE INDEX audit_logs_actor_idx    ON public.audit_logs (actor_id, occurred_at DESC, id DESC);

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read audit logs" ON public.audit_logs
  FOR SELECT USING (public.is_admin_user());

-- Triggers write as the SECURITY DEFINER owner; clients must never write directly.
REVOKE INSERT, UPDATE, DELETE ON public.audit_logs FROM PUBLIC, anon, authenticated;

-- === Generic row-change trigger ===

CREATE OR REPLACE FUNCTION public.audit_row_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_old jsonb;
  v_new jsonb;
  v_row jsonb;
  v_changed text[];
  v_oldvals jsonb;
  v_newvals jsonb;
  v_actor uuid;
  v_source text := 'system';
  v_record uuid;
  v_subject uuid;
  v_property uuid;
  v_service uuid;
  k text;
  -- updates touching only these columns are not audited at all
  c_noise CONSTANT text[] := ARRAY[
    'updated_at', 'views_count', 'menu_views_count',
    'rating', 'reviews_count', 'review_count', 'clicks_count'
  ];
  -- bulky payload columns: dropped from snapshots, "[omitted]" in diffs
  c_strip CONSTANT text[] := ARRAY[
    'photos', 'menu', 'documents', 'content', 'construction_stages', 'matched_properties'
  ];
  -- first matching key becomes subject_user_id (whom the row concerns)
  c_subject_keys CONSTANT text[] := ARRAY[
    'user_id', 'guest_id', 'owner_id', 'renter_id', 'sender_id',
    'cleaner_id', 'recipient_id', 'applicant_user_id', 'author_id'
  ];
BEGIN
  BEGIN -- outer guard: nothing in here may ever break the parent write
    v_old := CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD) END;
    v_new := CASE WHEN TG_OP IN ('UPDATE', 'INSERT') THEN to_jsonb(NEW) END;
    v_row := COALESCE(v_new, v_old);

    IF TG_OP = 'UPDATE' THEN
      SELECT COALESCE(array_agg(key), '{}') INTO v_changed
      FROM jsonb_object_keys(v_new) AS key
      WHERE (v_old -> key) IS DISTINCT FROM (v_new -> key)
        AND NOT (key = ANY (c_noise));
      IF COALESCE(array_length(v_changed, 1), 0) = 0 THEN
        RETURN NULL; -- noise-only update: skip entirely
      END IF;
      SELECT
        jsonb_object_agg(key, CASE WHEN key = ANY (c_strip) THEN '"[omitted]"'::jsonb ELSE v_old -> key END),
        jsonb_object_agg(key, CASE WHEN key = ANY (c_strip) THEN '"[omitted]"'::jsonb ELSE v_new -> key END)
      INTO v_oldvals, v_newvals
      FROM unnest(v_changed) AS key;
    ELSE
      v_oldvals := CASE WHEN TG_OP = 'DELETE' THEN v_old - c_strip END;
      v_newvals := CASE WHEN TG_OP = 'INSERT' THEN v_new - c_strip END;
    END IF;

    -- safe casts: site_settings has a text PK, balances/sms_automation_rules have no id
    BEGIN v_record := (v_row ->> 'id')::uuid; EXCEPTION WHEN OTHERS THEN v_record := NULL; END;

    FOREACH k IN ARRAY c_subject_keys LOOP
      BEGIN v_subject := (v_row ->> k)::uuid; EXCEPTION WHEN OTHERS THEN v_subject := NULL; END;
      EXIT WHEN v_subject IS NOT NULL;
    END LOOP;
    IF v_subject IS NULL AND TG_TABLE_NAME = 'profiles' THEN
      v_subject := v_record;
    END IF;

    BEGIN
      v_property := CASE WHEN TG_TABLE_NAME = 'properties' THEN v_record ELSE (v_row ->> 'property_id')::uuid END;
    EXCEPTION WHEN OTHERS THEN v_property := NULL; END;
    BEGIN
      v_service := CASE WHEN TG_TABLE_NAME = 'services' THEN v_record ELSE (v_row ->> 'service_id')::uuid END;
    EXCEPTION WHEN OTHERS THEN v_service := NULL; END;

    v_actor := auth.uid();
    IF v_actor IS NOT NULL THEN
      v_source := 'user';
    ELSE
      BEGIN
        IF (current_setting('request.jwt.claims', true)::jsonb ->> 'role') = 'service_role' THEN
          v_actor := ((current_setting('request.headers', true))::jsonb ->> 'x-actor-id')::uuid;
          IF v_actor IS NOT NULL THEN
            v_source := 'admin';
          END IF;
        END IF;
      EXCEPTION WHEN OTHERS THEN
        v_actor := NULL;
        v_source := 'system';
      END;
    END IF;

    INSERT INTO public.audit_logs
      (table_name, operation, record_id, actor_id, actor_source, subject_user_id,
       property_id, service_id, changed_fields, old_values, new_values)
    VALUES
      (TG_TABLE_NAME, TG_OP, v_record, v_actor, v_source, v_subject,
       v_property, v_service, v_changed, v_oldvals, v_newvals);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'audit_row_change failed on %.% (%): %', TG_TABLE_SCHEMA, TG_TABLE_NAME, TG_OP, SQLERRM;
  END;
  RETURN COALESCE(NEW, OLD);
END;
$$;

REVOKE ALL ON FUNCTION public.audit_row_change() FROM PUBLIC, anon, authenticated;

-- === Attach to every audited table ===
-- Excluded on purpose: page_views (pure telemetry), notifications (machine-generated),
-- contact_events (already an immutable log), audit_logs itself (recursion).

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'profiles', 'properties', 'services', 'bookings', 'transactions', 'balances',
    'verifications', 'reviews', 'smart_match_requests', 'smart_match_offers',
    'cleaning_tasks', 'calendar_blocks', 'price_overrides', 'promocodes',
    'manual_bookings', 'favorites', 'sms_outbound', 'sms_broadcasts', 'sms_messages',
    'sms_automation_rules', 'user_subscriptions', 'leads', 'job_applications',
    'renter_guests', 'renter_cleaners', 'cleaner_profiles', 'zones',
    'pricing_packages', 'site_settings', 'landing_banners', 'blog_posts', 'ads',
    'broadcasts', 'project_updates'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_audit_row ON public.%I', t);
    EXECUTE format(
      'CREATE TRIGGER trg_audit_row AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.audit_row_change()',
      t
    );
  END LOOP;
END $$;

-- === Login trigger ===
-- GoTrue updates auth.users.last_sign_in_at on every real sign-in (not on token
-- refresh), so the WHEN clause is the login signal. SECURITY DEFINER owned by
-- postgres lets the insert work from supabase_auth_admin's session.

CREATE OR REPLACE FUNCTION public.audit_login()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  BEGIN
    INSERT INTO public.audit_logs
      (table_name, operation, record_id, actor_id, actor_source, subject_user_id, new_values)
    VALUES
      ('auth.users', 'LOGIN', NEW.id, NEW.id, 'user', NEW.id,
       jsonb_build_object('last_sign_in_at', NEW.last_sign_in_at));
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'audit_login failed for %: %', NEW.id, SQLERRM;
  END;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.audit_login() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_audit_login ON auth.users;
CREATE TRIGGER trg_audit_login
  AFTER UPDATE ON auth.users
  FOR EACH ROW
  WHEN (OLD.last_sign_in_at IS DISTINCT FROM NEW.last_sign_in_at)
  EXECUTE FUNCTION public.audit_login();

-- === Backfill: seed the timeline with "created" events from existing rows ===
-- All source tables are tiny (≤ a few hundred rows). actor unknown -> 'system'.

INSERT INTO public.audit_logs (occurred_at, table_name, operation, record_id, actor_source, subject_user_id, new_values)
SELECT COALESCE(p.created_at, now()), 'profiles', 'INSERT', p.id, 'system', p.id, to_jsonb(p)
FROM public.profiles p;

INSERT INTO public.audit_logs (occurred_at, table_name, operation, record_id, actor_source, subject_user_id, property_id, new_values)
SELECT COALESCE(p.created_at, now()), 'properties', 'INSERT', p.id, 'system', p.owner_id, p.id,
       to_jsonb(p) - ARRAY['photos', 'construction_stages']
FROM public.properties p;

INSERT INTO public.audit_logs (occurred_at, table_name, operation, record_id, actor_source, subject_user_id, service_id, new_values)
SELECT COALESCE(s.created_at, now()), 'services', 'INSERT', s.id, 'system', s.owner_id, s.id,
       to_jsonb(s) - ARRAY['photos', 'menu']
FROM public.services s;

INSERT INTO public.audit_logs (occurred_at, table_name, operation, record_id, actor_source, subject_user_id, property_id, new_values)
SELECT COALESCE(b.created_at, now()), 'bookings', 'INSERT', b.id, 'system', b.guest_id, b.property_id, to_jsonb(b)
FROM public.bookings b;

INSERT INTO public.audit_logs (occurred_at, table_name, operation, record_id, actor_source, subject_user_id, new_values)
SELECT COALESCE(t.created_at, now()), 'transactions', 'INSERT', t.id, 'system', t.user_id, to_jsonb(t)
FROM public.transactions t;

INSERT INTO public.audit_logs (occurred_at, table_name, operation, record_id, actor_source, subject_user_id, property_id, new_values)
SELECT COALESCE(r.created_at, now()), 'reviews', 'INSERT', r.id, 'system', r.guest_id, r.property_id, to_jsonb(r)
FROM public.reviews r;

INSERT INTO public.audit_logs (occurred_at, table_name, operation, record_id, actor_source, subject_user_id, property_id, new_values)
SELECT COALESCE(v.created_at, now()), 'verifications', 'INSERT', v.id, 'system', v.user_id, v.property_id,
       to_jsonb(v) - ARRAY['documents']
FROM public.verifications v;
