-- Service page views were being written to the wrong column.
--
-- Before 9828eba each service detail client incremented `services.views_count`
-- directly from the browser. That commit replaced those writes with the shared
-- /api/listings/[kind]/[id]/view beacon, but wired the service branch to
-- `increment_service_menu_views`, which bumps `services.menu_views_count`.
-- Nothing noticed, because the beacon's rate limiter was failing closed and the
-- branch never executed in production (see C16). Restoring the limiter makes it
-- execute, so the mis-wiring has to be fixed in the same breath:
--
--   * every service-owner surface reads `views_count`
--     (FoodDashboardClient, ServiceDashboardClient, dashboard/admin/listings,
--     and `owner_dashboard_stats.views_total` for EVERY owner scope), so the
--     count would have stayed at 0 forever;
--   * `menu_views_count` would have been double-purposed for food — the page
--     beacon on mount plus /api/menu/track on the menu-link click, i.e. two
--     "menu views" for one visitor who opens the menu. That endpoint also has an
--     owner self-view guard the page beacon does not, so an owner reloading
--     their own listing would have inflated a rendered metric.
--
-- Mirrors increment_service_menu_views exactly (SECURITY DEFINER, search_path
-- pinned, service_role-only EXECUTE, active rows only); only the column differs.
CREATE OR REPLACE FUNCTION public.increment_service_views(p_service_id uuid)
RETURNS void
LANGUAGE sql
SET search_path TO 'public'
SECURITY DEFINER
AS $function$
  update public.services
  set views_count = views_count + 1
  where id = p_service_id and status = 'active';
$function$;

REVOKE ALL ON FUNCTION public.increment_service_views(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.increment_service_views(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.increment_service_views(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.increment_service_views(uuid) TO service_role;

notify pgrst, 'reload schema';
