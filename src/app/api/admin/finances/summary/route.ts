import { requireAdmin } from "@/lib/auth/require-admin";
import { createServiceClient } from "@/lib/supabase/admin";
import { getAdminStats } from "@/lib/admin/getAdminStats";

export const runtime = "nodejs";

export async function GET() {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  const db = createServiceClient();

  const stats = await getAdminStats();
  if (!stats) {
    return Response.json({ error: "stats_unavailable" }, { status: 500 });
  }

  const gross = stats.gross_revenue;
  const net = stats.net_revenue;
  const perListing =
    stats.active_listings > 0 ? net / stats.active_listings : 0;

  const recent = await db
    .from("transactions")
    .select(
      "id, amount, type, description, created_at, user:profiles!transactions_user_id_fkey(display_name)",
    )
    .order("created_at", { ascending: false })
    .limit(10);

  return Response.json({
    gross,
    net,
    perListing,
    recent: recent.data ?? [],
  });
}
