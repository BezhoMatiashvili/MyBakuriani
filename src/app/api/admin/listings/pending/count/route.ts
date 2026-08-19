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

  const [propertiesRes, servicesRes, changesRes, membershipsRes] = await Promise.all([
    db
      .from("properties")
      .select("*", { count: "exact", head: true })
      .eq("status", "pending"),
    db
      .from("services")
      .select("*", { count: "exact", head: true })
      .eq("status", "pending"),
    // content_change_requests is introduced after generated DB types; keep
    // this endpoint compatible until the next Supabase type generation.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db as any)
      .from("content_change_requests")
      .select("*", { count: "exact", head: true })
      .eq("status", "pending"),
    db
      .from("user_subscriptions")
      .select("*", { count: "exact", head: true })
      .eq("status", "pending_approval"),
  ]);

  if (
    propertiesRes.error ||
    servicesRes.error ||
    changesRes.error ||
    membershipsRes.error
  ) {
    const message =
      propertiesRes.error?.message ??
      servicesRes.error?.message ??
      changesRes.error?.message ??
      membershipsRes.error?.message ??
      "error";
    return Response.json({ error: message }, { status: 500 });
  }

  return Response.json(
    {
      count:
        (propertiesRes.count ?? 0) +
        (servicesRes.count ?? 0) +
        (changesRes.count ?? 0),
      changes: changesRes.count ?? 0,
      memberships: membershipsRes.count ?? 0,
    },
    // Short private cache: the badge refetches on every admin navigation,
    // so let rapid navigations reuse the response for 30s.
    { headers: { "Cache-Control": "private, max-age=30" } },
  );
}
