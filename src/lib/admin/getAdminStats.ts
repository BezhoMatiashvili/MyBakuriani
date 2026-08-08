import { createServiceClient } from "@/lib/supabase/admin";

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
  visits_7d: number;
  searches_7d: number;
  requests_7d: number;
  completed_7d: number;
};

export type AdminStatsData = AdminDashboardStatsRow & {
  net_revenue: number;
  pending_over_24h: number;
  total_visits: number;
  unique_visits: number;
  registered_visitors: number;
  registered_users: number;
  weekly_visitors: number;
  visits_7d: number;
  searches_7d: number;
  requests_7d: number;
  completed_7d: number;
};

/**
 * Computes the merged admin dashboard stats. Shared by the stats API route and
 * the admin dashboard server component so the merge logic lives in one place.
 * Returns null when the base RPC fails (caller surfaces stats_unavailable).
 */
export async function getAdminStats(): Promise<AdminStatsData | null> {
  const service = createServiceClient();

  // Both RPCs are SECURITY DEFINER and revoked from authenticated (security
  // audit fix — admin_dashboard_stats had no internal admin check and was
  // callable by any signed-in user), so both must run through the service_role
  // client (which bypasses grants). Cast: not yet in the generated DB types;
  // regenerate types to drop these casts.
  const baseStats = (
    service.rpc as unknown as (fn: "admin_dashboard_stats") => {
      single<T>(): Promise<{ data: T | null; error: unknown }>;
    }
  )("admin_dashboard_stats").single<AdminDashboardStatsRow>();

  const overviewStats = (
    service.rpc as unknown as (fn: "admin_overview_stats") => {
      single<T>(): Promise<{ data: T | null; error: unknown }>;
    }
  )("admin_overview_stats").single<AdminOverviewStatsRow>();

  const [base, overview] = await Promise.all([baseStats, overviewStats]);

  if (base.error || !base.data) {
    return null;
  }

  const data: AdminStatsData = {
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
    visits_7d: overview.data?.visits_7d ?? 0,
    searches_7d: overview.data?.searches_7d ?? 0,
    requests_7d: overview.data?.requests_7d ?? 0,
    completed_7d: overview.data?.completed_7d ?? 0,
  };

  return data;
}
