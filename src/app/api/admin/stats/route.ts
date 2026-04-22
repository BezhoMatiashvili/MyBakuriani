import { createClient } from "@/lib/supabase/server";
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

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const supabase = await createClient();
  // Cast: admin_dashboard_stats RPC is defined in migration
  // 20260422165037_admin_dashboard_stats_rpc.sql; regenerate DB types to drop.
  const { data, error } = await (
    supabase.rpc as unknown as (fn: "admin_dashboard_stats") => {
      single<T>(): Promise<{ data: T | null; error: unknown }>;
    }
  )("admin_dashboard_stats").single<AdminDashboardStatsRow>();

  if (error) {
    return Response.json({ error: "stats_unavailable" }, { status: 500 });
  }

  return Response.json(
    { data },
    { headers: { "cache-control": "private, max-age=30" } },
  );
}
