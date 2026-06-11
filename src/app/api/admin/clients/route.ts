import { requireAdmin } from "@/lib/auth/require-admin";
import { createServiceClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

// Clients directory for the admin dashboard: profiles + listings count +
// balance in a single RPC instead of three full-table client-side fetches.
export async function GET() {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const db = createServiceClient();
  const { data, error } = await db.rpc("admin_clients_with_stats");
  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ clients: data ?? [] });
}
