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
  const { data, error } = await db
    .from("transactions")
    .select("id, amount, type, description, created_at")
    .eq("user_id", id)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ transactions: data ?? [] });
}
