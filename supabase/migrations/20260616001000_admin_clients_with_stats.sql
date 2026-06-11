-- Admin clients directory: every profile with its property count and balance,
-- joined in SQL instead of three full-table transfers to the browser
-- (profiles + all properties + all balances merged client-side).
--
-- SECURITY DEFINER to read all rows; execution revoked from every client
-- role — only the service-role client in /api/admin/clients (behind
-- requireAdmin) calls it. Same convention as admin_overview_stats.
--
-- listings_count counts only properties (not services) — exact parity with
-- the previous client-side merge on the admin clients page.

create or replace function public.admin_clients_with_stats()
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(
    jsonb_agg(
      to_jsonb(p) || jsonb_build_object(
        'listings_count', coalesce(pc.cnt, 0),
        'balance_amount', coalesce(b.amount, 0)
      )
      order by p.created_at desc
    ),
    '[]'::jsonb
  )
  from public.profiles p
  left join (
    select owner_id, count(*)::bigint as cnt
    from public.properties
    group by owner_id
  ) pc on pc.owner_id = p.id
  left join public.balances b on b.user_id = p.id;
$$;

revoke all on function public.admin_clients_with_stats() from public;
revoke all on function public.admin_clients_with_stats() from anon;
revoke all on function public.admin_clients_with_stats() from authenticated;
