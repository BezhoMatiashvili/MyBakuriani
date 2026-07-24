import { NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";
import { isUuid } from "@/lib/utils/uuid";

export const runtime = "nodejs";

/** Bounded, server-only analytics write; no browser RPC grant is required. */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ kind: string; id: string }> },
) {
  const { kind, id } = await params;
  if (!isUuid(id) || (kind !== "property" && kind !== "service")) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }
  // Count at most one view per trusted client IP/listing/day.  This is a
  // deliberately conservative analytics signal, not a billing primitive.
  if (!(await checkRateLimit(`listing-view:${getClientIp(req)}:${kind}:${id}`, 1, 86_400_000))) {
    return Response.json({ counted: false });
  }
  const db = createServiceClient();
  const table = kind === "property" ? "properties" : "services";
  const { data: listing } = await db
    .from(table)
    .select("id")
    .eq("id", id)
    .eq("status", "active")
    .maybeSingle();
  if (!listing) return Response.json({ error: "not_found" }, { status: 404 });
  const rpc = kind === "property" ? "increment_views" : "increment_service_menu_views";
  const args = kind === "property" ? { prop_id: id } : { p_service_id: id };
  const { error } = await db.rpc(rpc, args as never);
  if (error) return Response.json({ counted: false }, { status: 503 });
  return Response.json({ counted: true });
}
