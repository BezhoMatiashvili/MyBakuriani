-- Single-round-trip payload for the dashboard layout sidebar/header:
-- unread counts, balance, cabinet-derivation flags and cleaner state.
-- Replaces 7 parallel REST queries per dashboard layout render.
--
-- SECURITY INVOKER (default): every sub-select reads only the caller's own
-- rows, all of which the layout previously read through the user-scoped
-- client, so RLS provably permits each one. auth.uid() filters are
-- belt-and-suspenders on top of RLS.

create or replace function public.dashboard_layout_data()
returns jsonb
language sql
set search_path = public
stable
as $$
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
    )
  );
$$;

revoke all on function public.dashboard_layout_data() from public;
revoke all on function public.dashboard_layout_data() from anon;
grant execute on function public.dashboard_layout_data() to authenticated;
