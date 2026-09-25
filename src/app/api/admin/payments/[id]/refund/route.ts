import { requireAdmin } from "@/lib/auth/require-admin";
import { gelToTetri, tetriToGel } from "@/lib/payments/keepz/amount";
import {
  isDefinitiveRejection,
  keepzErrorSummary,
  refundOrder,
} from "@/lib/payments/keepz/client";
import { getKeepzConfig } from "@/lib/payments/keepz/config";
import { syncPaymentWithKeepz } from "@/lib/payments/keepz/settle";
import { checkRateLimit } from "@/lib/rateLimit";
import { createServiceClient } from "@/lib/supabase/admin";
import { isUuid } from "@/lib/utils/uuid";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStore = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

const BEGIN_ERRORS: Record<string, [string, number]> = {
  payment_not_found: ["not_found", 404],
  payment_not_refundable: ["payment_not_refundable", 409],
  refund_in_flight: ["refund_in_flight", 409],
  refund_already_made: ["refund_already_made", 409],
  refund_exceeds_payment: ["refund_exceeds_payment", 400],
  insufficient_wallet_balance: ["insufficient_wallet_balance", 409],
  invalid_amount: ["invalid_amount", 400],
};

/**
 * Refunds (part of) a Keepz card payment back to the card (C32).
 *
 * Order matters: keepz_begin_refund debits the wallet and records the refund
 * in one transaction BEFORE Keepz is asked, so the credit cannot be spent
 * meanwhile. Then:
 *   - Keepz acknowledges  → 'submitted'; the result comes via status polling.
 *   - Keepz refuses       → 'failed'; the wallet is given back at once.
 *   - no clear answer     → 'unknown'; an admin resolves it after checking the
 *                           Keepz portal. Never retried automatically — a
 *                           retry could refund the card twice.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  const adminId = guard.admin.userId;
  const { id } = await params;
  if (!isUuid(id)) return noStore({ error: "not_found" }, 404);
  if (
    !(await checkRateLimit(`keepz-refund:admin:${adminId}`, 20, 60 * 60_000))
  ) {
    return noStore({ error: "rate_limited" }, 429);
  }
  const config = getKeepzConfig();
  if (!config) return noStore({ error: "payments_unavailable" }, 503);

  const body = (await request.json().catch(() => null)) as {
    amount?: unknown;
    reason?: unknown;
  } | null;
  const tetri = gelToTetri(body?.amount);
  if (tetri === null || tetri < 1) {
    return noStore({ error: "invalid_amount" }, 400);
  }
  const reason =
    typeof body?.reason === "string" ? body.reason.trim().slice(0, 500) : null;
  const paymentId = id.toLowerCase();

  const db = createServiceClient(adminId);
  const { data: begun, error: beginError } = await db.rpc(
    "keepz_begin_refund",
    {
      p_payment_id: paymentId,
      p_amount: tetriToGel(tetri),
      p_admin_id: adminId,
      p_reason: reason,
    },
  );
  if (beginError || !begun) {
    const key = Object.keys(BEGIN_ERRORS).find((k) =>
      beginError?.message?.includes(k),
    );
    if (key) {
      const [error, status] = BEGIN_ERRORS[key];
      return noStore({ error }, status);
    }
    console.error(`[keepz] refund begin failed (${beginError?.code})`);
    return noStore({ error: "refund_failed" }, 500);
  }
  const refundId = (begun as { refund_id: string }).refund_id;

  try {
    await refundOrder(config, { orderId: paymentId, amountTetri: tetri });
  } catch (err) {
    console.error(
      `[keepz] ${paymentId}: refund request failed — ${keepzErrorSummary(err)}`,
    );
    if (isDefinitiveRejection(err)) {
      const { error } = await db.rpc("keepz_resolve_refund", {
        p_refund_id: refundId,
        p_outcome: "failed",
        p_error: `provider_rejected:${err.code ?? err.group ?? err.httpStatus}`,
        p_actor_id: adminId,
      });
      if (error)
        console.error(
          `[keepz] refund ${refundId}: restore failed (${error.code})`,
        );
      return noStore({ error: "provider_rejected", code: err.code }, 502);
    }
    const { error } = await db.rpc("keepz_update_refund", {
      p_refund_id: refundId,
      p_status: "unknown",
      p_error: "no_confirmation",
    });
    if (error)
      console.error(
        `[keepz] refund ${refundId}: mark unknown failed (${error.code})`,
      );
    return noStore({ refundId, status: "unknown" }, 202);
  }

  const { error: submitError } = await db.rpc("keepz_update_refund", {
    p_refund_id: refundId,
    p_status: "submitted",
    p_provider_status: "REFUND_REQUESTED",
  });
  if (submitError) {
    console.error(
      `[keepz] refund ${refundId}: mark submitted failed (${submitError.code})`,
    );
  }
  // Keepz settles refunds asynchronously; one immediate check catches fast ones.
  await syncPaymentWithKeepz(db, config, paymentId);
  const { data: refund } = await db
    .from("payment_refunds")
    .select("id, status, amount")
    .eq("id", refundId)
    .maybeSingle();
  return noStore({ refundId, status: refund?.status ?? "submitted" });
}
