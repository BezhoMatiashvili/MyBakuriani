import { requireUser } from "@/lib/auth/require-user";
import { getKeepzConfig } from "@/lib/payments/keepz/config";
import { loadOwnerPayment } from "@/lib/payments/keepz/settle";
import { checkRateLimit } from "@/lib/rateLimit";
import { createServiceClient } from "@/lib/supabase/admin";
import { isUuid } from "@/lib/utils/uuid";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStore = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

/** The payer's own Keepz payment, reconciled with Keepz while it is open. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireUser();
  if (!guard.ok) return guard.response;
  const { id } = await params;
  if (!isUuid(id)) return noStore({ error: "not_found" }, 404);
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
      { id: id.toLowerCase() },
    );
    return payment
      ? noStore({ payment })
      : noStore({ error: "not_found" }, 404);
  } catch (err) {
    console.error(
      `[keepz] status route failed: ${err instanceof Error ? err.name : "error"}`,
    );
    return noStore({ error: "status_unavailable" }, 500);
  }
}
