import { requireAdmin } from "@/lib/auth/require-admin";
import { createServiceClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

// Real transaction history for the admin client-details modal.
export async function GET(_req: Request, ctx: RouteContext) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const { id } = await ctx.params;
  if (!id) return Response.json({ error: "id required" }, { status: 400 });

  const db = createServiceClient();
  const [{ data, error }, { data: stats, error: statsError }] =
    await Promise.all([
      db
        .from("transactions")
        .select("id, amount, type, description, created_at")
        .eq("user_id", id)
        .order("created_at", { ascending: false })
        .limit(200),
      // The lifetime tiles come from one SQL definition (C26/C42): ltv is the
      // client's purchases net of refunds, as on /dashboard/admin/purchases.
      db.rpc("admin_client_wallet_stats", { p_user_id: id }),
    ]);
  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
  if (statsError) {
    return Response.json({ error: statsError.message }, { status: 500 });
  }

  const tiles = (stats ?? {}) as {
    vip_count?: number;
    topup_count?: number;
    ltv?: number;
  };
  return Response.json({
    transactions: data ?? [],
    stats: {
      vipCount: Number(tiles.vip_count ?? 0),
      topupCount: Number(tiles.topup_count ?? 0),
      ltv: Number(tiles.ltv ?? 0),
    },
  });
}
