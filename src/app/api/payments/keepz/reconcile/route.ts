import { createHash, timingSafeEqual } from "node:crypto";
import { getKeepzConfig } from "@/lib/payments/keepz/config";
import { syncPaymentWithKeepz } from "@/lib/payments/keepz/settle";
import { createServiceClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BATCH = 25;
const TIME_BUDGET_MS = 20_000;

/**
 * Bearer check against KEEPZ_RECONCILE_SECRET_SHA256. Only the SHA-256 of the
 * secret lives in the app env; the secret itself is generated inside the
 * database (Vault) and never leaves it except in pg_cron's request.
 */
function authorized(request: Request): "ok" | "denied" | "unconfigured" {
  const expected = (process.env.KEEPZ_RECONCILE_SECRET_SHA256 ?? "")
    .trim()
    .toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(expected)) return "unconfigured";
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) return "denied";
  const digest = createHash("sha256").update(token, "utf8").digest();
  return timingSafeEqual(digest, Buffer.from(expected, "hex"))
    ? "ok"
    : "denied";
}

/**
 * Reconcile sweeper (C32), driven by pg_cron every 10 minutes. Settles Keepz
 * orders whose callback never arrived and whose payer never came back, and
 * follows up refunds Keepz has acknowledged but not finished. Server to
 * server: exempt from the middleware Origin check (server-paths.ts).
 */
export async function POST(request: Request) {
  const auth = authorized(request);
  if (auth === "unconfigured") {
    return Response.json({ error: "not_configured" }, { status: 503 });
  }
  if (auth === "denied") {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const config = getKeepzConfig();
  if (!config)
    return Response.json({ error: "payments_unavailable" }, { status: 503 });

  const db = createServiceClient();
  const now = Date.now();
  const iso = (ms: number) => new Date(ms).toISOString();

  const [open, refunds] = await Promise.all([
    db
      .from("payments")
      .select("id")
      .eq("provider", "keepz")
      .in("status", ["pending", "declined"])
      .lt("created_at", iso(now - 60_000))
      .gt("created_at", iso(now - 7 * 24 * 60 * 60_000))
      .or(`last_checked_at.is.null,last_checked_at.lt.${iso(now - 5 * 60_000)}`)
      .order("created_at", { ascending: true })
      .limit(BATCH),
    db
      .from("payment_refunds")
      .select("payment_id")
      .eq("status", "submitted")
      .order("updated_at", { ascending: true })
      .limit(BATCH),
  ]);
  if (open.error || refunds.error) {
    console.error("[keepz] reconcile: could not load work");
    return Response.json({ error: "reconcile_failed" }, { status: 500 });
  }

  const ids = [
    ...new Set([
      ...(open.data ?? []).map((row) => row.id),
      ...(refunds.data ?? []).map((row) => row.payment_id),
    ]),
  ];
  const counts = {
    checked: 0,
    applied: 0,
    credited: 0,
    notFound: 0,
    unavailable: 0,
  };
  for (const id of ids) {
    if (Date.now() - now > TIME_BUDGET_MS) break;
    const result = await syncPaymentWithKeepz(db, config, id);
    counts.checked += 1;
    if (result.outcome === "applied") {
      counts.applied += 1;
      if (result.credited) counts.credited += 1;
    } else if (result.outcome === "not_found") {
      counts.notFound += 1;
    } else {
      counts.unavailable += 1;
    }
  }
  return Response.json({ ...counts, pending: ids.length - counts.checked });
}
