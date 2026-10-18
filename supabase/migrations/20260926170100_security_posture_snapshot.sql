-- C29/C34: read-only catalog snapshot of the privilege posture, read by
-- scripts/check-db-contracts.mjs with the service-role key. Lets CI-style checks catch a
-- migration that re-grants writes on a view, exposes a SECURITY DEFINER function to anon,
-- disables RLS, or restores the old default privileges.
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
    ), '[]'::jsonb)
  );
$$;

REVOKE ALL ON FUNCTION public.security_posture_snapshot() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.security_posture_snapshot() TO service_role;
