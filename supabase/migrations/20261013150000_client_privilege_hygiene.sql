-- Client-role privilege hygiene (C34). RLS stays the row-level gate; these table grants were
-- Supabase defaults that no client path uses. Generated from the live catalog 2026-10-13.

-- No API role uses TRUNCATE (it does not run RLS), TRIGGER, REFERENCES or MAINTAIN (PG17: VACUUM,
-- ANALYZE, REINDEX, CLUSTER, REFRESH MATERIALIZED VIEW, LOCK TABLE; no function in public issues one).
REVOKE TRUNCATE, TRIGGER, REFERENCES, MAINTAIN ON ALL TABLES IN SCHEMA public FROM anon, authenticated;

-- anon inserts nothing through the API (no policy grants anon an INSERT).
REVOKE INSERT ON ALL TABLES IN SCHEMA public FROM anon;

-- Written only by server code (service role and SECURITY DEFINER functions); no client write policy exists.
REVOKE INSERT, UPDATE, DELETE ON public.balances, public.transactions, public.user_subscriptions,
  public.blog_posts, public.service_menu_items FROM anon, authenticated;

-- The posture snapshot reports the three lists above (check-db-contracts C34 expects them empty) and
-- the DEFINER functions authenticated can execute (C34 compares them with an allow-list).
CREATE OR REPLACE FUNCTION public.security_posture_snapshot()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT jsonb_build_object(
    'writable_views', COALESCE((
      SELECT jsonb_agg(DISTINCT c.relname)
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      CROSS JOIN (VALUES ('anon'), ('authenticated')) AS r(role_name)
      WHERE n.nspname = 'public' AND c.relkind IN ('v', 'm')
        AND (has_table_privilege(r.role_name, c.oid, 'INSERT')
          OR has_table_privilege(r.role_name, c.oid, 'UPDATE')
          OR has_table_privilege(r.role_name, c.oid, 'DELETE'))
    ), '[]'::jsonb),
    'anon_definer_functions', COALESCE((
      SELECT jsonb_agg(p.oid::regprocedure::text ORDER BY p.oid::regprocedure::text)
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.prosecdef
        AND has_function_privilege('anon', p.oid, 'EXECUTE')
    ), '[]'::jsonb),
    'public_definer_functions', COALESCE((
      SELECT jsonb_agg(p.oid::regprocedure::text ORDER BY p.oid::regprocedure::text)
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.prosecdef
        AND has_function_privilege('public', p.oid, 'EXECUTE')
    ), '[]'::jsonb),
    'rls_disabled_tables', COALESCE((
      SELECT jsonb_agg(c.relname ORDER BY c.relname)
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') AND NOT c.relrowsecurity
    ), '[]'::jsonb),
    'default_acl', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'role', pg_get_userbyid(d.defaclrole),
        'schema', COALESCE(dn.nspname, '*'),
        'objtype', d.defaclobjtype::text,
        'acl', d.defaclacl::text))
      FROM pg_default_acl d
      LEFT JOIN pg_namespace dn ON dn.oid = d.defaclnamespace
      WHERE pg_get_userbyid(d.defaclrole) = 'postgres'
        AND (d.defaclnamespace = 0 OR dn.nspname = 'public')
    ), '[]'::jsonb),
    -- C34/S1/S2: per-role write posture on the client-facing tables. Table-level
    -- booleans come from has_table_privilege (table ACL only); the column arrays
    -- list columns holding a COLUMN-level grant to the role or to PUBLIC (grantee 0),
    -- read from pg_attribute.attacl via aclexplode (information_schema.column_privileges
    -- expands table grants to every column and would over-report). SELECT grants are
    -- intentionally not surfaced.
    'client_write_grants', COALESCE((
      SELECT jsonb_object_agg(t.tbl, t.per_role)
      FROM (
        SELECT c.relname AS tbl, jsonb_object_agg(r.role_name, jsonb_build_object(
          'insert', has_table_privilege(r.role_name, c.oid, 'INSERT'),
          'update', has_table_privilege(r.role_name, c.oid, 'UPDATE'),
          'delete', has_table_privilege(r.role_name, c.oid, 'DELETE'),
          'truncate', has_table_privilege(r.role_name, c.oid, 'TRUNCATE'),
          'insert_columns', COALESCE((
            SELECT jsonb_agg(DISTINCT a.attname ORDER BY a.attname)
            FROM pg_attribute a, aclexplode(a.attacl) ae
            WHERE a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
              AND ae.grantee IN (r.role_name::regrole::oid, 0) AND ae.privilege_type = 'INSERT'
          ), '[]'::jsonb),
          'update_columns', COALESCE((
            SELECT jsonb_agg(DISTINCT a.attname ORDER BY a.attname)
            FROM pg_attribute a, aclexplode(a.attacl) ae
            WHERE a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
              AND ae.grantee IN (r.role_name::regrole::oid, 0) AND ae.privilege_type = 'UPDATE'
          ), '[]'::jsonb)
        )) AS per_role
        FROM pg_class c
        CROSS JOIN (VALUES ('anon'::name), ('authenticated'::name)) AS r(role_name)
        WHERE c.oid IN ('public.profiles'::regclass, 'public.properties'::regclass,
                        'public.services'::regclass, 'public.bookings'::regclass,
                        'public.smart_match_requests'::regclass,
                        'public.manual_bookings'::regclass, 'public.reviews'::regclass)
        GROUP BY c.relname, c.oid
      ) t
    ), '{}'::jsonb),
    -- Client-role privilege hygiene (20261013150000): no API role holds TRUNCATE (it does not
    -- run RLS), TRIGGER, REFERENCES or MAINTAIN on a public relation; anon inserts nowhere; the tables only
    -- server code writes take no client INSERT/UPDATE/DELETE. RLS stays the row-level gate.
    'authenticated_definer_functions', COALESCE((
      SELECT jsonb_agg(p.oid::regprocedure::text ORDER BY p.oid::regprocedure::text)
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.prosecdef
        AND has_function_privilege('authenticated', p.oid, 'EXECUTE')
    ), '[]'::jsonb),
    'client_privilege_hygiene', jsonb_build_object(
      'rls_bypass_grants', COALESCE((
        SELECT jsonb_agg(format('%s:%s:%s', c.relname, r.role_name, p.priv) ORDER BY c.relname, r.role_name, p.priv)
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        CROSS JOIN (VALUES ('anon'::name), ('authenticated'::name)) AS r(role_name)
        CROSS JOIN (VALUES ('TRUNCATE'), ('TRIGGER'), ('REFERENCES'), ('MAINTAIN')) AS p(priv)
        WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
          AND has_table_privilege(r.role_name, c.oid, p.priv)
      ), '[]'::jsonb),
      'anon_insert_relations', COALESCE((
        SELECT jsonb_agg(c.relname ORDER BY c.relname)
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
          AND has_any_column_privilege('anon', c.oid, 'INSERT')
      ), '[]'::jsonb),
      'server_only_client_writes', COALESCE((
        SELECT jsonb_agg(format('%s:%s:%s', c.relname, r.role_name, p.priv) ORDER BY c.relname, r.role_name, p.priv)
        FROM pg_class c
        CROSS JOIN (VALUES ('anon'::name), ('authenticated'::name)) AS r(role_name)
        CROSS JOIN (VALUES ('INSERT'), ('UPDATE'), ('DELETE')) AS p(priv)
        WHERE c.oid IN ('public.balances'::regclass, 'public.transactions'::regclass,
                        'public.user_subscriptions'::regclass, 'public.blog_posts'::regclass,
                        'public.service_menu_items'::regclass)
          AND CASE WHEN p.priv = 'DELETE' THEN has_table_privilege(r.role_name, c.oid, 'DELETE')
                   ELSE has_any_column_privilege(r.role_name, c.oid, p.priv) END
      ), '[]'::jsonb)
    ),
    -- Storage (C5, 2026-10-14: 20261013150500 / 150600 / 150900): the per-owner upload budget
    -- trigger is installed and enabled; only the two folder-pinned UPDATE policies remain (a move
    -- is an UPDATE the budget does not see); no permissive policy is open to anon or PUBLIC.
    'storage', jsonb_build_object(
      'budget_trigger_enabled', COALESCE((
        SELECT t.tgenabled <> 'D'
        FROM pg_trigger t
        WHERE t.tgrelid = 'storage.objects'::regclass
          AND t.tgname = 'enforce_storage_upload_budget' AND NOT t.tgisinternal
      ), false),
      'update_policies', COALESCE((
        SELECT jsonb_agg(p.policyname ORDER BY p.policyname)
        FROM pg_policies p
        WHERE p.schemaname = 'storage' AND p.tablename = 'objects' AND p.cmd IN ('UPDATE', 'ALL')
      ), '[]'::jsonb),
      'policies_open_to_anon', COALESCE((
        SELECT jsonb_agg(p.policyname ORDER BY p.policyname)
        FROM pg_policies p
        WHERE p.schemaname = 'storage' AND p.tablename = 'objects' AND p.permissive = 'PERMISSIVE'
          AND p.roles && ARRAY['public', 'anon']::name[]
      ), '[]'::jsonb)
    )
  );
$function$
;
