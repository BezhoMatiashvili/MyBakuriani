import { requireAdmin } from "@/lib/auth/require-admin";
import { getAdminStats } from "@/lib/admin/getAdminStats";

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const data = await getAdminStats();

  if (!data) {
    return Response.json({ error: "stats_unavailable" }, { status: 500 });
  }

  return Response.json(
    { data },
    { headers: { "cache-control": "private, max-age=30" } },
  );
}
