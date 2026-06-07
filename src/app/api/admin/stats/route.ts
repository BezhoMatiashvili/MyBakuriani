import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";

type AdminDashboardStatsRow = {
  active_listings: number;
  total_properties: number;
  total_bookings: number;
  completed_bookings: number;
  active_or_completed_bookings: number;
  total_revenue: number;
  average_response_minutes: number;
  average_booking_price: number;
};

type AdminOverviewStatsRow = {
  net_revenue: number;
  active_listings: number;
  pending_over_24h: number;
  total_visits: number;
  unique_visits: number;
  registered_visitors: number;
  registered_users: number;
  weekly_visitors: number;
};

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const supabase = await createClient();
  const service = createServiceClient();

  // Cast: both RPCs are defined in migrations and not yet in the generated DB
  // types; regenerate types to drop these casts.
  const baseStats = (
    supabase.rpc as unknown as (fn: "admin_dashboard_stats") => {
      single<T>(): Promise<{ data: T | null; error: unknown }>;
    }
  )("admin_dashboard_stats").single<AdminDashboardStatsRow>();

  // admin_overview_stats is SECURITY DEFINER and revoked from authenticated, so
  // it must run through the service_role client (which bypasses grants).
  const overviewStats = (
    service.rpc as unknown as (fn: "admin_overview_stats") => {
      single<T>(): Promise<{ data: T | null; error: unknown }>;
    }
  )("admin_overview_stats").single<AdminOverviewStatsRow>();

  const [base, overview] = await Promise.all([baseStats, overviewStats]);

  if (base.error || !base.data) {
    return Response.json({ error: "stats_unavailable" }, { status: 500 });
  }

  const data = {
    ...base.data,
    // Platform-wide aggregates from admin_overview_stats override / extend the
    // base RPC. active_listings here includes services (base counts properties
    // only). If the overview RPC failed, fall back to base values / zeros.
    active_listings:
      overview.data?.active_listings ?? base.data.active_listings,
    net_revenue: overview.data?.net_revenue ?? 0,
    pending_over_24h: overview.data?.pending_over_24h ?? 0,
    total_visits: overview.data?.total_visits ?? 0,
    unique_visits: overview.data?.unique_visits ?? 0,
    registered_visitors: overview.data?.registered_visitors ?? 0,
    registered_users: overview.data?.registered_users ?? 0,
    weekly_visitors: overview.data?.weekly_visitors ?? 0,
  };

  return Response.json(
    { data },
    { headers: { "cache-control": "private, max-age=30" } },
  );
}
