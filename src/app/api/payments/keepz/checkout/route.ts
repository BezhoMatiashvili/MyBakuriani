import { requireUser } from "@/lib/auth/require-user";
import { COMPANY_TIERS } from "@/lib/org-tiers";
import {
  gelToTetri,
  isValidCardTopupTetri,
  tetriToGel,
} from "@/lib/payments/keepz/amount";
import {
  createOrder,
  isDefinitiveRejection,
  keepzErrorSummary,
} from "@/lib/payments/keepz/client";
import { getKeepzConfig } from "@/lib/payments/keepz/config";
import {
  isUuidV4,
  parsePurchaseIntent,
  type PurchaseIntent,
} from "@/lib/payments/keepz/intent";
import { checkRateLimit } from "@/lib/rateLimit";
import { safeInternalPath } from "@/lib/security";
import { createServiceClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/types/database";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStore = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

// Payments start from dashboard pages, and the result page sends the payer
// back there. Anything else falls back to the dashboard root.
function dashboardReturnPath(value: unknown): string {
  const path = safeInternalPath(value);
  return path && /^\/dashboard(\/|$)/.test(path) && path.length <= 300
    ? path
    : "/dashboard";
}

/**
 * Starts a Keepz card top-up (C32). Body: { requestId, amount, returnPath,
 * resume?, locale? }. `requestId` is the client's idempotency key and becomes
 * the payment id / Keepz integratorOrderId. The amount is wallet credit the
 * payer chooses (1–2000 ₾); an optional `resume` purchase is stored for the
 * result page to replay once through the unchanged purchase endpoints.
 */
export async function POST(request: Request) {
  const guard = await requireUser();
  if (!guard.ok) return guard.response;
  const userId = guard.user.id;

  if (
    !(await checkRateLimit(`keepz-checkout:user:${userId}`, 10, 10 * 60_000))
  ) {
    return noStore({ error: "rate_limited" }, 429);
  }

  const config = getKeepzConfig();
  if (!config) return noStore({ error: "payments_unavailable" }, 503);

  const body = (await request.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return noStore({ error: "invalid_request" }, 400);
  }
  if (!isUuidV4(body.requestId)) {
    return noStore({ error: "invalid_request" }, 400);
  }
  const tetri = gelToTetri(body.amount);
  if (tetri === null || !isValidCardTopupTetri(tetri)) {
    return noStore({ error: "invalid_amount" }, 400);
  }
  let resume: PurchaseIntent | null = null;
  if (body.resume !== undefined && body.resume !== null) {
    resume = parsePurchaseIntent(body.resume, COMPANY_TIERS);
    if (!resume) return noStore({ error: "invalid_request" }, 400);
  }
  const paymentId = body.requestId.toLowerCase();
  const returnPath = dashboardReturnPath(body.returnPath);
  const language = body.locale === "en" || body.locale === "ru" ? "EN" : "KA";

  const db = createServiceClient();
  const { data: opened, error: openError } = await db.rpc(
    "keepz_open_payment",
    {
      p_payment_id: paymentId,
      p_user_id: userId,
      p_amount: tetriToGel(tetri),
      p_return_path: returnPath,
      p_resume: resume as unknown as Json,
    },
  );
  if (openError) {
    const message = openError.message ?? "";
    if (message.includes("too_many_open_orders")) {
      return noStore({ error: "too_many_open_orders" }, 429);
    }
    if (message.includes("payment_id_conflict") || openError.code === "23505") {
      return noStore({ error: "request_conflict" }, 409);
    }
    if (openError.code === "22023") {
      return noStore({ error: "invalid_request" }, 400);
    }
    console.error(
      `[keepz] checkout: could not open payment (${openError.code})`,
    );
    return noStore({ error: "checkout_failed" }, 500);
  }

  const state = opened as {
    created: boolean;
    status: string;
    checkout_url: string | null;
  };
  if (!state.created) {
    // Exact replay (double click / network retry) of an order already created.
    return state.status === "pending" && state.checkout_url
      ? noStore({ paymentId, checkoutUrl: state.checkout_url })
      : noStore({ error: "request_conflict" }, 409);
  }

  try {
    const { checkoutUrl } = await createOrder(config, {
      orderId: paymentId,
      amountTetri: tetri,
      language,
    });
    const { error } = await db
      .from("payments")
      .update({ checkout_url: checkoutUrl })
      .eq("id", paymentId)
      .eq("status", "pending");
    if (error) {
      // Only orders with a stored checkout URL can ever be credited
      // (20260925150300), so never hand out a link we could not record.
      console.error(
        `[keepz] ${paymentId}: checkout url not stored (${error.code})`,
      );
      return noStore({ error: "checkout_failed" }, 500);
    }
    return noStore({ paymentId, checkoutUrl });
  } catch (err) {
    console.error(
      `[keepz] ${paymentId}: create order failed — ${keepzErrorSummary(err)}`,
    );
    if (isDefinitiveRejection(err)) {
      // Keepz refused the order itself, so it can never be paid.
      await db
        .from("payments")
        .update({
          status: "cancelled",
          last_error: `provider_rejected:${err.code ?? err.group ?? err.httpStatus}`,
          completed_at: new Date().toISOString(),
        })
        .eq("id", paymentId)
        .eq("status", "pending")
        .is("credited_at", null);
      return noStore({ error: "provider_rejected" }, 502);
    }
    // Outcome unknown (timeout etc.): leave it pending — the sweeper asks
    // Keepz later and either settles it or retires it.
    return noStore({ error: "provider_unavailable" }, 502);
  }
}
