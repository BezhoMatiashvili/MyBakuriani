-- Extend the consolidated dashboard layout RPC with the caller's approved
-- organizations so the seller sidebar can render the "ჩემი ორგანიზაციები" /
-- "ჩემი კომპანია" nav items without an extra round trip. SECURITY INVOKER
-- (runs as the caller, RLS-bounded) — the org_members / organizations read
-- policies already permit a member to read their own membership + org.
CREATE OR REPLACE FUNCTION public.dashboard_layout_data()
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
  select jsonb_build_object(
    'unread_count', (
      select count(*) from public.notifications n
      where n.user_id = auth.uid() and n.is_read = false
    ),
    'smart_match_unread', (
      select count(*) from public.notifications n
      where n.user_id = auth.uid()
        and n.type = 'smart_match_request'
        and n.is_read = false
    ),
    'balance_amount', (
      select b.amount from public.balances b where b.user_id = auth.uid()
    ),
    'sms_remaining', (
      select b.sms_remaining from public.balances b where b.user_id = auth.uid()
    ),
    'is_for_sale_flags', coalesce((
      select jsonb_agg(coalesce(p.is_for_sale, false))
      from public.properties p where p.owner_id = auth.uid()
    ), '[]'::jsonb),
    'service_categories', coalesce((
      select jsonb_agg(s.category)
      from public.services s where s.owner_id = auth.uid()
    ), '[]'::jsonb),
    'cleaning_tasks_count', (
      select count(*) from public.cleaning_tasks ct
      where ct.cleaner_id = auth.uid()
    ),
    'cleaner_online', (
      select cp.is_online from public.cleaner_profiles cp
      where cp.id = auth.uid()
    ),
    'organizations', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', o.id,
          'name', o.brand_name,
          'role', m.role,
          'status', o.status
        ) order by o.created_at
      )
      from public.organization_members m
      join public.organizations o on o.id = m.organization_id
      where m.user_id = auth.uid() and m.status = 'approved'
    ), '[]'::jsonb)
  );
$function$;
