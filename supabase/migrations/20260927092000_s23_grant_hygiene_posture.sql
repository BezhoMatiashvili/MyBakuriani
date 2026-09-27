-- Security hardening S2/S3 follow-up (2026-09-27). Grant hygiene the S2 reviews found, and the
-- posture snapshot now reports the tables S2 gave column-level client writes (C34).
-- reviews: the guest rating page INSERTs and admins UPDATE under RLS; nothing deletes or writes
-- anonymously, and a 0-row anonymous write still fired the statement-level SMS lock trigger.
-- smart_match_requests: DELETE was inert (no policy) and would let a guest reset its 24 h cap.

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.reviews FROM anon;
REVOKE DELETE, TRUNCATE ON public.reviews FROM authenticated;
REVOKE DELETE ON public.smart_match_requests FROM authenticated;

CREATE OR REPLACE FUNCTION public.security_posture_snapshot()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
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
    ), '{}'::jsonb)
  );
$$;

REVOKE ALL ON FUNCTION public.security_posture_snapshot() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.security_posture_snapshot() TO service_role;
