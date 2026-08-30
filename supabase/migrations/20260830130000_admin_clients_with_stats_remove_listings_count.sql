-- listings_count was properties-only (omitted services) and is confirmed
-- unrendered anywhere in src/ (grep shows only the now-removed TS type field
-- on ProfileWithCounts in dashboard/admin/clients/page.tsx). Remove it rather
-- than fix it, since there's no rendering surface to validate a fix against
-- today (Fix Area I, plans/frolicking-conjuring-deer.md).
create or replace function public.admin_clients_with_stats()
returns jsonb
language sql
stable security definer
set search_path to 'public'
as $function$
  select coalesce(
    jsonb_agg(
      to_jsonb(p) || jsonb_build_object(
        'balance_amount', coalesce(b.amount, 0)
      )
      order by p.created_at desc
    ),
    '[]'::jsonb
  )
  from public.profiles p
  left join public.balances b on b.user_id = p.id;
$function$;

notify pgrst, 'reload schema';
