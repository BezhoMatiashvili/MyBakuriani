import { requireAdmin } from "@/lib/auth/require-admin";
import { createServiceClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;
const OPEN_REFUND = ["requested", "submitted", "unknown"];

type RefundRow = {
  id: string;
  payment_id: string;
  amount: number;
  status: string;
  provider_status: string | null;
  last_error: string | null;
  reason: string | null;
  created_at: string;
  resolved_at: string | null;
};

const noStore = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

/**
 * Keepz card payments for the admin payments page (C32). `view`:
 *   all      — every Keepz payment, newest first
 *   review   — payments with a review_flag (refunds nobody here requested)
 *   refunds  — payments with a refund still in flight or unresolved
 */
export async function GET(request: Request) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const params = new URL(request.url).searchParams;
  const view = params.get("view") ?? "all";
  const page = Math.min(Math.max(Number(params.get("page")) || 0, 0), 1000);
  const db = createServiceClient();

  let query = db
    .from("payments")
    .select(
      "id, user_id, amount, status, provider_status, provider_transaction_id, created_at, credited_at, refunded_amount, review_flag, last_checked_at, last_error, user:profiles!payments_user_id_fkey(display_name)",
      { count: "exact" },
    )
    .eq("provider", "keepz")
    .order("created_at", { ascending: false })
    .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);

  if (view === "review") {
    query = query.not("review_flag", "is", null);
  } else if (view === "refunds") {
    const { data: open, error } = await db
      .from("payment_refunds")
      .select("payment_id")
      .in("status", OPEN_REFUND)
      .limit(500);
    if (error) return noStore({ error: "load_failed" }, 500);
    const ids = [...new Set((open ?? []).map((row) => row.payment_id))];
    if (ids.length === 0) return noStore({ payments: [], total: 0, page });
    query = query.in("id", ids);
  }

  const { data: payments, count, error } = await query;
  if (error) return noStore({ error: "load_failed" }, 500);
  const rows = payments ?? [];
  const paymentIds = rows.map((row) => row.id);
  const userIds = [...new Set(rows.map((row) => row.user_id))];

  const [refunds, balances] = await Promise.all([
    paymentIds.length
      ? db
          .from("payment_refunds")
          .select(
            "id, payment_id, amount, status, provider_status, last_error, reason, created_at, resolved_at",
          )
          .in("payment_id", paymentIds)
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [], error: null }),
    userIds.length
      ? db.from("balances").select("user_id, amount").in("user_id", userIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (refunds.error || balances.error) {
    return noStore({ error: "load_failed" }, 500);
  }

  const walletByUser = new Map(
    (balances.data ?? []).map((row) => [row.user_id, Number(row.amount)]),
  );
  const refundsByPayment = new Map<string, RefundRow[]>();
  for (const refund of (refunds.data ?? []) as RefundRow[]) {
    const list = refundsByPayment.get(refund.payment_id) ?? [];
    list.push(refund);
    refundsByPayment.set(refund.payment_id, list);
  }

  return noStore({
    total: count ?? 0,
    page,
    pageSize: PAGE_SIZE,
    payments: rows.map((row) => {
      const paymentRefunds = refundsByPayment.get(row.id) ?? [];
      const inFlight = paymentRefunds.some((r) =>
        OPEN_REFUND.includes(r.status),
      );
      // One refund Keepz has registered per payment (20260925150300); only an
      // attempt Keepz refused outright leaves the payment refundable.
      const registered = paymentRefunds.some(
        (r) =>
          !(
            r.status === "failed" &&
            (r.last_error ?? "").startsWith("provider_rejected:")
          ),
      );
      const wallet = walletByUser.get(row.user_id) ?? 0;
      const remaining = Number(row.amount) - Number(row.refunded_amount);
      // Mirrors keepz_begin_refund's own checks; the RPC stays the authority.
      const maxRefund =
        row.status === "succeeded" &&
        row.credited_at &&
        !inFlight &&
        !registered
          ? Math.max(0, Math.min(remaining, wallet))
          : 0;
      return {
        ...row,
        amount: Number(row.amount),
        refunded_amount: Number(row.refunded_amount),
        wallet_balance: wallet,
        max_refund: Math.round(maxRefund * 100) / 100,
        refunds: paymentRefunds.map((refund) => ({
          ...refund,
          amount: Number(refund.amount),
        })),
      };
    }),
  });
}
