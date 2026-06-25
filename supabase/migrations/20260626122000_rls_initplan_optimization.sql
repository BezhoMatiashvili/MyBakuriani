-- Performance: wrap auth.*() and is_admin_user() calls inside RLS policies as
-- (select ...) so Postgres evaluates them ONCE per query (InitPlan) instead of
-- once per row. Fixes the `auth_rls_initplan` advisor. The policy LOGIC is
-- unchanged — auth.uid()/is_admin_user() are STABLE, so (select ...) returns the
-- same value; only the evaluation count changes.
--
-- Implemented as a generator over pg_policies so the file and the applied SQL are
-- identical and the rewrite is exact (decompiled-from-catalog expressions). It
-- uses ALTER POLICY, which preserves each policy's command, roles and PERMISSIVE
-- flag (no DROP/CREATE window). Re-run safe: policies already wrapped are skipped.
-- On first apply this rewrites 90 policies.

DO $$
DECLARE
  r record;
  nq text;
  nwc text;
  stmt text;
BEGIN
  FOR r IN
    SELECT tablename, policyname, qual, with_check
    FROM pg_policies
    WHERE schemaname = 'public'
      -- idempotency guard: skip policies already wrapped
      AND coalesce(qual,'')       NOT ILIKE '%select auth.uid()%'
      AND coalesce(qual,'')       NOT ILIKE '%select is_admin_user()%'
      AND coalesce(with_check,'') NOT ILIKE '%select auth.uid()%'
      AND coalesce(with_check,'') NOT ILIKE '%select is_admin_user()%'
  LOOP
    nq := regexp_replace(regexp_replace(regexp_replace(regexp_replace(coalesce(r.qual,''),
            'auth\.uid\(\)',  '(select auth.uid())',  'g'),
            'auth\.role\(\)', '(select auth.role())', 'g'),
            'auth\.jwt\(\)',  '(select auth.jwt())',  'g'),
            'is_admin_user\(\)', '(select is_admin_user())', 'g');
    nwc := regexp_replace(regexp_replace(regexp_replace(regexp_replace(coalesce(r.with_check,''),
            'auth\.uid\(\)',  '(select auth.uid())',  'g'),
            'auth\.role\(\)', '(select auth.role())', 'g'),
            'auth\.jwt\(\)',  '(select auth.jwt())',  'g'),
            'is_admin_user\(\)', '(select is_admin_user())', 'g');

    IF nq IS DISTINCT FROM coalesce(r.qual,'') OR nwc IS DISTINCT FROM coalesce(r.with_check,'') THEN
      stmt := format('ALTER POLICY %I ON public.%I', r.policyname, r.tablename);
      IF btrim(coalesce(r.qual,'')) <> '' THEN
        stmt := stmt || ' USING (' || nq || ')';
      END IF;
      IF btrim(coalesce(r.with_check,'')) <> '' THEN
        stmt := stmt || ' WITH CHECK (' || nwc || ')';
      END IF;
      EXECUTE stmt;
    END IF;
  END LOOP;
END $$;
