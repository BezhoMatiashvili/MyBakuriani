import { requireAdmin } from "@/lib/auth/require-admin";
import { getKeepzConfig } from "@/lib/payments/keepz/config";
import { syncPaymentWithKeepz } from "@/lib/payments/keepz/settle";
import { checkRateLimit } from "@/lib/rateLimit";
import { createServiceClient } from "@/lib/supabase/admin";
import { isUuid } from "@/lib/utils/uuid";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStore = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

/**
 * Asks Keepz for the current status of one payment and applies it — the only
 * way to notice refunds made on Keepz's side, which Keepz never pushes (C32).
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  const { id } = await params;
  if (!isUuid(id)) return noStore({ error: "not_found" }, 404);
  if (
    !(await checkRateLimit(
      `keepz-admin-recheck:${guard.admin.userId}`,
      60,
      60_000,
    ))
  ) {
    return noStore({ error: "rate_limited" }, 429);
  }
  const config = getKeepzConfig();
  if (!config) return noStore({ error: "payments_unavailable" }, 503);

  const db = createServiceClient(guard.admin.userId);
  const { data: payment } = await db
    .from("payments")
    .select("id")
    .eq("id", id.toLowerCase())
    .eq("provider", "keepz")
    .maybeSingle();
  if (!payment) return noStore({ error: "not_found" }, 404);

  const result = await syncPaymentWithKeepz(db, config, payment.id);
  return result.outcome === "unavailable"
    ? noStore({ error: "provider_unavailable" }, 502)
    : noStore({ result });
}
