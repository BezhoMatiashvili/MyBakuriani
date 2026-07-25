-- One canonical definition of "Smart Match requests this renter still has to answer".
--
-- Before this, four surfaces each rolled their own count and none of them agreed:
--   * the inbox stat card / banner  -> active, non-expired requests MINUS ones I answered
--   * the renter overview stat card -> the same, but zone-filtered and NOT minus answered
--   * the sidebar promo card        -> count(unread notifications of type
--                                      'smart_match_request'), which is offer-blind and
--                                      expiry-blind: it kept saying "2 ახალი მოთხოვნა"
--                                      after both requests had been answered
-- `notifications` has no FK back to smart_match_requests, so an inserted offer could
-- never mark "its" notification read — the sidebar number was unfixable in place. And a
-- request going stale is the clock passing, not a write: no trigger can fire for it. So
-- the count has to be computed at query time from the source tables, which is this.
--
-- The function deliberately mirrors the inbox query in
-- src/app/[locale]/dashboard/renter/smart-match/page.tsx one-for-one:
--   .eq("status","active").order("created_at",{ascending:false}).limit(30)
--   then !isStale(r, today)                     -> check_out is null or >= today (UTC)
--   then minus submittedRequestIds              -> not exists an offer by this renter
-- SECURITY INVOKER (the default) so RLS bounds it: "Renters view active requests" on
-- smart_match_requests and renter_read_own_offers on smart_match_offers.

-- smart_match_requests had no index on status/created_at at all (only guest_id + pkey).
-- This count moves from "once per Smart Match page visit" to "once per dashboard route
-- render, every role" — the layout RPC is awaited in a force-dynamic layout — so the
-- ORDER BY ... LIMIT 30 must not be a seq scan + sort. If this RPC ever hit the
-- statement timeout, dashboard/layout.tsx falls back to `{}` and the whole sidebar
-- (cabinets, balance, badges) collapses, which is far worse than a stale number.
CREATE INDEX IF NOT EXISTS idx_smart_match_requests_active_created
  ON public.smart_match_requests (created_at DESC)
  WHERE status = 'active';

CREATE OR REPLACE FUNCTION public.smart_match_actionable_count()
RETURNS integer
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
  -- Renter gate first, as a CASE rather than a WHERE clause, so a guest / cleaner /
  -- seller / admin never touches smart_match_requests at all. It is also load-bearing
  -- for correctness: without an active non-sale listing the RLS disjunct
  -- "Renters view active requests" is false, only "Users see own requests" can pass,
  -- and the caller would count their OWN guest requests. One probe on the existing
  -- idx_properties_owner_active_rental.
  select case when exists (
    select 1 from public.properties p
    where p.owner_id = auth.uid()
      and p.status = 'active'
      and p.is_for_sale = false
  ) then (
    select count(*)::int
    from (
      select r.id, r.check_out
      from public.smart_match_requests r
      where r.status = 'active'
      order by r.created_at desc
      limit 30
    ) r
    where (r.check_out is null or r.check_out >= (now() at time zone 'utc')::date)
      -- One renter may hold several offers on one request (the unique key is
      -- (request_id, property_id), not (request_id, renter_id)), so this must be an
      -- EXISTS, never a count. Cancelled offers still count as answered — same as the
      -- inbox, whose offers query has no status filter.
      and not exists (
        select 1 from public.smart_match_offers o
        where o.request_id = r.id
          and o.renter_id = auth.uid()
      )
  ) else 0 end;
$function$;

revoke all on function public.smart_match_actionable_count() from public;
revoke all on function public.smart_match_actionable_count() from anon;
grant execute on function public.smart_match_actionable_count() to authenticated;


-- Re-declare the layout RPC with the new key. Body is otherwise verbatim from
-- 20260627090500_dashboard_layout_org_data.sql; only 'smart_match_unread' (unread
-- notification rows) is replaced by 'smart_match_actionable' (unanswered requests).
-- The old key is dropped rather than kept alongside so no future caller can pick the
-- wrong one — during a non-atomic migrate/deploy window either order yields a missing
-- key, which reads as 0 and renders the promo card's neutral "სტუმრების მოთხოვნები"
-- headline. Never a wrong non-zero, which is the bug being fixed.
-- CREATE OR REPLACE preserves the existing ACL.
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
    'smart_match_actionable', public.smart_match_actionable_count(),
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

-- PostgREST caches the function catalogue, so a brand-new RPC is a 404 until it
-- reloads. Applied to prod on 2026-07-25 (MCP ledger version 20260725...).
notify pgrst, 'reload schema';
