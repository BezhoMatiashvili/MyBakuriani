-- Lock down EXECUTE on the org RPCs. Supabase's default privileges grant EXECUTE
-- on new public functions to anon & authenticated, so REVOKE FROM PUBLIC alone
-- (in 20260627090200) left anon/authenticated able to call them. This explicitly
-- removes those grants: the money RPC becomes service_role-only (invoked by the
-- company-subscription edge function), and the user RPCs become authenticated-only.
REVOKE EXECUTE ON FUNCTION public.purchase_company_subscription(uuid, uuid, text) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_organization(text,text,text,text,text,text,text,text,text,text,text,double precision,double precision) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.request_organization_membership(uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.respond_membership_request(uuid, text) FROM anon, PUBLIC;

GRANT EXECUTE ON FUNCTION public.purchase_company_subscription(uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.create_organization(text,text,text,text,text,text,text,text,text,text,text,double precision,double precision) TO authenticated;
GRANT EXECUTE ON FUNCTION public.request_organization_membership(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.respond_membership_request(uuid, text) TO authenticated;
