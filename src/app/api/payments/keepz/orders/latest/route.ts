import { requireUser } from "@/lib/auth/require-user";
import { getKeepzConfig } from "@/lib/payments/keepz/config";
import { loadOwnerPayment } from "@/lib/payments/keepz/settle";
import { checkRateLimit } from "@/lib/rateLimit";
import { createServiceClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStore = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

/**
 * The payer's most recent Keepz payment (last 24 h). Keepz's return URLs are
 * static and carry no order id, so the result page falls back to this when the
 * tab lost its sessionStorage (e.g. a banking app reopened the link).
 */
export async function GET() {
  const guard = await requireUser();
  if (!guard.ok) return guard.response;
  if (
    !(await checkRateLimit(`keepz-status:user:${guard.user.id}`, 60, 60_000))
  ) {
    return noStore({ error: "rate_limited" }, 429);
  }

  try {
    const payment = await loadOwnerPayment(
      createServiceClient(),
      getKeepzConfig(),
      guard.user.id,
      "latest",
    );
    return payment
      ? noStore({ payment })
      : noStore({ error: "not_found" }, 404);
  } catch (err) {
    console.error(
      `[keepz] latest route failed: ${err instanceof Error ? err.name : "error"}`,
    );
    return noStore({ error: "status_unavailable" }, 500);
  }
}
