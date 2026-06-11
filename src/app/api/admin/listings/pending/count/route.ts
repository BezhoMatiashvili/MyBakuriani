import { requireAdmin } from "@/lib/auth/require-admin";
import { createServiceClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

// Lightweight pending-verifications count for the admin sidebar badge. The
// sibling /pending route returns full rows + owner joins — too heavy to poll
// on every admin navigation.
export async function GET() {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const db = createServiceClient();

  const [propertiesRes, servicesRes] = await Promise.all([
    db
      .from("properties")
      .select("*", { count: "exact", head: true })
      .eq("status", "pending"),
    db
      .from("services")
      .select("*", { count: "exact", head: true })
      .eq("status", "pending"),
  ]);

  if (propertiesRes.error || servicesRes.error) {
    const message =
      propertiesRes.error?.message ?? servicesRes.error?.message ?? "error";
    return Response.json({ error: message }, { status: 500 });
  }

  return Response.json({
    count: (propertiesRes.count ?? 0) + (servicesRes.count ?? 0),
  });
}
