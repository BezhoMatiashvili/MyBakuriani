-- The earlier migration "purchase_package_rpc" only REVOKEd from PUBLIC,
-- which doesn't strip Supabase's default executor grants on `anon` and
-- `authenticated`. Result: /rest/v1/rpc/purchase_package was callable by
-- anonymous users even though the original migration only GRANTed EXECUTE
-- to service_role. The function is SECURITY DEFINER and takes p_user_id
-- as a parameter -- so unrestricted exposure would let an attacker drain
-- any user's balance. The only caller in the codebase is the
-- purchase-vip edge function, which uses the service role internally,
-- so locking this down to service_role-only matches actual usage.

REVOKE EXECUTE ON FUNCTION public.purchase_package(UUID, UUID, UUID, INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purchase_package(UUID, UUID, UUID, INT) TO service_role;
