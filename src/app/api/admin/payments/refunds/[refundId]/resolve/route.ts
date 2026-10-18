import { requireAdmin } from "@/lib/auth/require-admin";
import { createServiceClient } from "@/lib/supabase/admin";
import { isUuid } from "@/lib/utils/uuid";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStore = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

/**
 * Manual resolution of a refund whose outcome Keepz could not confirm (C32).
 * The admin checks the Keepz merchant portal first: 'succeeded' records the
 * refund; 'failed' gives the debited amount back to the user's wallet. The
 * RPC is idempotent, and audit_logs records the acting admin.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ refundId: string }> },
) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  const { refundId } = await params;
  if (!isUuid(refundId)) return noStore({ error: "not_found" }, 404);

  const body = (await request.json().catch(() => null)) as {
    outcome?: unknown;
  } | null;
  const outcome = body?.outcome;
  if (outcome !== "succeeded" && outcome !== "failed") {
    return noStore({ error: "invalid_outcome" }, 400);
  }

  const db = createServiceClient(guard.admin.userId);
  const { data: refund } = await db
    .from("payment_refunds")
    .select("id, status")
    .eq("id", refundId.toLowerCase())
    .maybeSingle();
  if (!refund) return noStore({ error: "not_found" }, 404);
  if (refund.status === "succeeded" || refund.status === "failed") {
    return noStore({ error: "already_resolved" }, 409);
  }
  // A 'submitted' refund is Keepz's to finish; resolving it by hand could
  // pay the customer twice (keepz_resolve_refund enforces this too).
  if (refund.status !== "requested" && refund.status !== "unknown") {
    return noStore({ error: "not_resolvable" }, 409);
  }

  const { data, error } = await db.rpc("keepz_resolve_refund", {
    p_refund_id: refund.id,
    p_outcome: outcome,
    p_error: "resolved_by_admin",
    p_actor_id: guard.admin.userId,
  });
  if (error) {
    console.error(`[keepz] resolve refund failed (${error.code})`);
    return noStore({ error: "resolve_failed" }, 500);
  }
  return noStore({ result: data });
}
