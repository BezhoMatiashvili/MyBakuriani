import { requireAdmin } from "@/lib/auth/require-admin";
import { createServiceClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function GET() {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  const db = createServiceClient();

  const [{ data: tx }, { data: bookings }, { count: propertiesCount }] =
    await Promise.all([
      db.from("transactions").select("amount, type, created_at"),
      db.from("bookings").select("total_price, status"),
      db
        .from("properties")
        .select("*", { count: "exact", head: true })
        .eq("status", "active"),
    ]);

  const gross = (tx ?? []).reduce(
    (sum, t) => (t.amount > 0 ? sum + Number(t.amount) : sum),
    0,
  );
  const fees = (tx ?? [])
    .filter((t) => t.type === "commission")
    .reduce((sum, t) => sum + Math.abs(Number(t.amount)), 0);
  const net = gross - fees;
  const completedRevenue = (bookings ?? [])
    .filter((b) => b.status === "completed")
    .reduce((sum, b) => sum + Number(b.total_price ?? 0), 0);
  const perListing =
    (propertiesCount ?? 0) > 0 ? net / (propertiesCount ?? 1) : 0;

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
    completedRevenue,
    perListing,
    recent: recent.data ?? [],
  });
}
