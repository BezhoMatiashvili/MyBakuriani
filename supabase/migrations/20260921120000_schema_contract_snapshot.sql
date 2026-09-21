-- Read-only introspection for scripts/check-db-contracts.mjs.
--
-- Returns, as one jsonb document, the database-side halves of the string-keyed
-- contracts in memory-bank/contracts.md so a Node script can compare them with
-- their TypeScript twins over PostgREST (which cannot run ad-hoc SQL):
--   enums              C3  — every public enum and its labels (vs Constants)
--   check_value_lists  C12/C19 — every `col = ANY(ARRAY[...])` CHECK on a
--                      public table (vs BANNER_PLACEMENTS, DASHBOARD_SCOPES)
--   realtime_tables    C7  — members of the supabase_realtime publication
--                      (vs every postgres_changes subscription in src/)
--   cron_jobs          C4  — scheduled jobs (vs the 5 the app expects)
--   review_gate        C14 — the per-table reviewable arrays parsed out of
--                      prevent_unreviewed_public_content_update() (vs
--                      REVIEWABLE_FIELDS); parsed from the live function body,
--                      not a third hand-written copy
--
-- SECURITY DEFINER only so it can read cron.job; it writes nothing. Execute is
-- restricted to service_role — the script runs with the service key.
create or replace function public.schema_contract_snapshot()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'enums', (
      select coalesce(jsonb_object_agg(e.typname, e.labels), '{}'::jsonb)
      from (
        select t.typname, jsonb_agg(en.enumlabel order by en.enumsortorder) as labels
        from pg_type t
        join pg_enum en on en.enumtypid = t.oid
        join pg_namespace n on n.oid = t.typnamespace
        where n.nspname = 'public'
        group by t.typname
      ) e
    ),
    'check_value_lists', (
      select coalesce(jsonb_agg(jsonb_build_object('table', x.rel, 'column', x.col, 'values', x.vals) order by x.rel, x.col), '[]'::jsonb)
      from (
        select c.conrelid::regclass::text as rel,
               m[1] as col,
               (select jsonb_agg(v[1]) from regexp_matches(m[2], '''([^'']*)''::[a-z_]+', 'g') v) as vals
        from pg_constraint c
        join pg_namespace n on n.oid = c.connamespace,
        regexp_match(pg_get_constraintdef(c.oid), '\(([a-z_]+) = ANY \(ARRAY\[(.*?)\]\)\)') m
        where c.contype = 'c' and n.nspname = 'public' and m is not null
      ) x
    ),
    'realtime_tables', (
      select coalesce(jsonb_agg(tablename order by tablename), '[]'::jsonb)
      from pg_publication_tables where pubname = 'supabase_realtime'
    ),
    'cron_jobs', (
      select coalesce(jsonb_agg(jsonb_build_object('name', jobname, 'schedule', schedule, 'active', active) order by jobname), '[]'::jsonb)
      from cron.job
    ),
    'review_gate', (
      select coalesce(jsonb_object_agg(y.tbl, y.arr), '{}'::jsonb)
      from (
        select m[1] as tbl,
               (select jsonb_agg(v[1]) from regexp_matches(m[2], '''([^'']*)''', 'g') v) as arr
        from regexp_matches(
          pg_get_functiondef('public.prevent_unreviewed_public_content_update'::regproc),
          'WHEN\s+''([a-z_]+)''\s+THEN\s+ARRAY\[([^\]]*)\]', 'g') m
      ) y
    )
  );
$$;

revoke all on function public.schema_contract_snapshot() from public, anon, authenticated;
grant execute on function public.schema_contract_snapshot() to service_role;

comment on function public.schema_contract_snapshot() is
  'Read-only jsonb snapshot of enum labels, CHECK value lists, realtime publication, cron jobs and the review-gate arrays, for scripts/check-db-contracts.mjs.';

notify pgrst, 'reload schema';
