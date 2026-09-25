import {
  callbackOrderId,
  parseCallbackFields,
} from "@/lib/payments/keepz/callback-body";
import { getKeepzConfig } from "@/lib/payments/keepz/config";
import { decryptEnvelope, isKeepzEnvelope } from "@/lib/payments/keepz/crypto";
import { syncPaymentWithKeepz } from "@/lib/payments/keepz/settle";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";
import { createServiceClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 16 * 1024;
const RECHECK_INTERVAL_MS = 3000;

async function readLimited(request: Request): Promise<string | null> {
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BODY_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

/**
 * Keepz payment callback (C32). Server to server: the middleware exempts this
 * exact path from the Origin check (server-paths.ts), and it never reads
 * cookies.
 *
 * Nothing in the body is trusted. It only tells us WHICH of our orders to
 * re-check; the money decision comes from our own GET /order/status call in
 * syncPaymentWithKeepz. A forged or replayed callback can at most make us ask
 * Keepz for a status we would have asked for anyway.
 */
export async function POST(request: Request) {
  const ok = () => Response.json({ ok: true });

  if (
    !(await checkRateLimit(
      `keepz-callback:ip:${getClientIp(request)}`,
      120,
      60_000,
    ))
  ) {
    return Response.json({ ok: false }, { status: 429 });
  }
  const config = getKeepzConfig();
  if (!config) return Response.json({ ok: false }, { status: 503 });

  if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) {
    return Response.json({ ok: false }, { status: 413 });
  }
  const raw = await readLimited(request);
  if (raw === null) return Response.json({ ok: false }, { status: 413 });

  const contentType = request.headers.get("content-type") ?? "";
  let fields = parseCallbackFields(raw, contentType);
  if (isKeepzEnvelope(fields)) {
    try {
      const opened = decryptEnvelope(fields, config.ownPrivateKey);
      fields =
        opened && typeof opened === "object" && !Array.isArray(opened)
          ? (opened as Record<string, unknown>)
          : null;
    } catch {
      fields = null;
    }
  }

  const orderId = callbackOrderId(fields);
  if (!orderId) {
    // Log the shape only (never values); the sweeper still settles the order.
    console.warn(
      `[keepz] callback without a usable order id (type=${contentType.split(";")[0] || "none"}, keys=${fields ? Object.keys(fields).slice(0, 12).join(",") : "unparsed"})`,
    );
    return ok();
  }
  const integratorId = fields?.integratorId;
  if (
    typeof integratorId === "string" &&
    integratorId.toLowerCase() !== config.integratorId.toLowerCase()
  ) {
    return ok();
  }

  const db = createServiceClient();
  const { data: payment, error } = await db
    .from("payments")
    .select("id, amount, last_checked_at")
    .eq("id", orderId)
    .eq("provider", "keepz")
    .maybeSingle();
  if (error) {
    console.error(`[keepz] callback lookup failed (${error.code})`);
    return Response.json({ ok: false }, { status: 503 });
  }
  if (!payment) return ok();
  // Just re-checked (a poll or an earlier callback): replaying a callback must
  // not turn into unbounded outbound status calls to Keepz.
  if (
    payment.last_checked_at &&
    Date.now() - Date.parse(payment.last_checked_at) < RECHECK_INTERVAL_MS
  ) {
    return ok();
  }

  const claimed = Number(fields?.amount);
  if (
    Number.isFinite(claimed) &&
    Math.round(claimed * 100) !== Math.round(Number(payment.amount) * 100)
  ) {
    // An alarm only: the stored amount is what gets credited.
    console.warn(`[keepz] ${orderId}: callback amount differs from the order`);
  }

  const result = await syncPaymentWithKeepz(db, config, orderId);
  // 503 lets Keepz retry; the sweeper covers it if Keepz does not.
  return result.outcome === "unavailable"
    ? Response.json({ ok: false }, { status: 503 })
    : ok();
}
