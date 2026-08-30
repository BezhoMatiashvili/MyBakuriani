import { createServiceClient } from "@/lib/supabase/admin";

export type AdminStatsData = {
  net_revenue: number;
  gross_revenue: number;
  active_listings: number;
  pending_over_24h: number;
  total_visits: number;
  unique_visits: number;
  registered_visitors: number;
  registered_users: number;
  weekly_visitors: number;
  visits_7d: number;
  searches_7d: number;
  bookings_7d: number;
  stays_completed_7d: number;
  occupancy_rate_pct: number;
  average_nightly_price: number;
};

/**
 * Fetches the admin dashboard stats. Shared by the stats API route and the
 * admin dashboard server component so the RPC call lives in one place.
 * Returns null when the RPC fails (caller surfaces stats_unavailable).
 */
export async function getAdminStats(): Promise<AdminStatsData | null> {
  const service = createServiceClient();

  // admin_overview_stats is SECURITY DEFINER and revoked from authenticated,
  // so it must run through the service_role client (which bypasses grants).
  const { data, error } = await service
    .rpc("admin_overview_stats")
    .single<AdminStatsData>();

  if (error || !data) {
    return null;
  }

  return data;
}
