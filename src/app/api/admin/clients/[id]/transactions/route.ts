import { requireAdmin } from "@/lib/auth/require-admin";
import { createServiceClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

const VIP_TX_TYPES = new Set(["vip_boost", "super_vip", "discount_badge"]);

// Real transaction history for the admin client-details modal.
export async function GET(_req: Request, ctx: RouteContext) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const { id } = await ctx.params;
  if (!id) return Response.json({ error: "id required" }, { status: 400 });

  const db = createServiceClient();
  const [{ data, error }, { data: allTx, error: statsError }] =
    await Promise.all([
      db
        .from("transactions")
        .select("id, amount, type, description, created_at")
        .eq("user_id", id)
        .order("created_at", { ascending: false })
        .limit(200),
      // Unlimited (unlike the 200-row list above) so the LTV/topup/VIP tiles
      // reflect the client's full lifetime history, not just their most recent
      // 200 transactions.
      db.from("transactions").select("type, amount").eq("user_id", id),
    ]);
  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
  if (statsError) {
    return Response.json({ error: statsError.message }, { status: 500 });
  }

  let vipCount = 0;
  let topupCount = 0;
  let ltv = 0;
  for (const tx of allTx ?? []) {
    const amount = Number(tx.amount);
    if (VIP_TX_TYPES.has(tx.type)) vipCount += 1;
    if (tx.type === "topup") topupCount += 1;
    // Spend = money out, excluding withdrawals (cash-out is not consumption)
    if (amount < 0 && tx.type !== "withdrawal") ltv += Math.abs(amount);
  }

  return Response.json({
    transactions: data ?? [],
    stats: { vipCount, topupCount, ltv },
  });
}
