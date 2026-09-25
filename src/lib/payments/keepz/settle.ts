import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";
import {
  getOrderStatus,
  KEEPZ_ORDER_NOT_FOUND,
  KeepzApiError,
  keepzErrorSummary,
} from "./client";
import type { KeepzConfig } from "./config";
import { isOpenPaymentStatus } from "./status";

type ServiceDb = SupabaseClient<Database>;

export type SyncResult =
  | {
      outcome: "applied";
      status: string;
      credited: boolean;
      reviewFlag: string | null;
    }
  | { outcome: "not_found" }
  | { outcome: "unavailable" };

// Keepz has never heard of an order this old: our create call failed after the
// row was written, so it can no longer be paid.
const NOT_FOUND_GRACE_MS = 10 * 60 * 1000;

/**
 * Fetches the authoritative Keepz status of one of our orders and applies it
 * through keepz_apply_payment_status (row lock, exactly-once credit). The
 * callback, the return-page poll, the sweeper and the admin re-check all go
 * through here, so nothing can apply a status it did not fetch itself (C32).
 */
export async function syncPaymentWithKeepz(
  db: ServiceDb,
  config: KeepzConfig,
  paymentId: string,
): Promise<SyncResult> {
  let fetched: Awaited<ReturnType<typeof getOrderStatus>>;
  try {
    fetched = await getOrderStatus(config, paymentId);
  } catch (err) {
    if (err instanceof KeepzApiError && err.code === KEEPZ_ORDER_NOT_FOUND) {
      const { error } = await db
        .from("payments")
        .update({
          status: "cancelled",
          last_error: "not_found_at_provider",
          completed_at: new Date().toISOString(),
        })
        .eq("id", paymentId)
        .eq("provider", "keepz")
        .is("credited_at", null)
        .in("status", ["pending", "declined"])
        .lt(
          "created_at",
          new Date(Date.now() - NOT_FOUND_GRACE_MS).toISOString(),
        );
      if (error) {
        console.error(
          `[keepz] ${paymentId}: not-found cleanup failed (${error.code})`,
        );
      }
      return { outcome: "not_found" };
    }
    console.error(
      `[keepz] ${paymentId}: status check failed — ${keepzErrorSummary(err)}`,
    );
    return { outcome: "unavailable" };
  }

  const { data, error } = await db.rpc("keepz_apply_payment_status", {
    p_payment_id: paymentId,
    p_provider_status: fetched.status,
    p_transaction_id: fetched.transactionId,
  });
  if (error || !data) {
    console.error(
      `[keepz] ${paymentId}: apply failed (${error?.code ?? "no data"})`,
    );
    return { outcome: "unavailable" };
  }
  const result = data as {
    status: string;
    credited: boolean;
    review_flag: string | null;
  };
  if (result.credited) console.info(`[keepz] ${paymentId}: wallet credited`);
  return {
    outcome: "applied",
    status: result.status,
    credited: result.credited,
    reviewFlag: result.review_flag,
  };
}

const OWNER_COLUMNS =
  "id, status, amount, created_at, credited_at, return_path, checkout_url, resume, resume_claimed_at, last_checked_at";

/** What a payer may see about their own payment — nothing provider-internal. */
export interface OwnerPaymentView {
  id: string;
  status: string;
  amount: number;
  createdAt: string;
  creditedAt: string | null;
  returnPath: string | null;
  /** Only while unpaid: lets the payer go back to Keepz's checkout page. */
  checkoutUrl: string | null;
  /** A card-button purchase is waiting to be completed (claimable once). */
  canResume: boolean;
}

type OwnerRow = {
  id: string;
  status: string;
  amount: number;
  created_at: string;
  credited_at: string | null;
  return_path: string | null;
  checkout_url: string | null;
  resume: unknown;
  resume_claimed_at: string | null;
  last_checked_at: string | null;
};

function toOwnerView(row: OwnerRow): OwnerPaymentView {
  return {
    id: row.id,
    status: row.status,
    amount: Number(row.amount),
    createdAt: row.created_at,
    creditedAt: row.credited_at,
    returnPath: row.return_path,
    checkoutUrl: row.status === "pending" ? row.checkout_url : null,
    canResume:
      row.status === "succeeded" &&
      row.resume !== null &&
      row.resume_claimed_at === null,
  };
}

// Polls arrive every ~2 s; Keepz is asked at most once per this interval.
const SYNC_INTERVAL_MS = 3000;
// The static return URL carries no order id, so "latest" looks back this far.
const LATEST_WINDOW_MS = 24 * 60 * 60 * 1000;

async function selectOwnerRow(
  db: ServiceDb,
  userId: string,
  selector: { id: string } | "latest",
): Promise<OwnerRow | null> {
  let query = db
    .from("payments")
    .select(OWNER_COLUMNS)
    .eq("user_id", userId)
    .eq("provider", "keepz");
  query =
    selector === "latest"
      ? query
          .gte(
            "created_at",
            new Date(Date.now() - LATEST_WINDOW_MS).toISOString(),
          )
          .order("created_at", { ascending: false })
          .limit(1)
      : query.eq("id", selector.id);
  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return (data as OwnerRow | null) ?? null;
}

/**
 * The owner's payment, reconciled with Keepz first when it is still open — so
 * the return page settles a payment even if the callback never arrives.
 */
export async function loadOwnerPayment(
  db: ServiceDb,
  config: KeepzConfig | null,
  userId: string,
  selector: { id: string } | "latest",
): Promise<OwnerPaymentView | null> {
  const row = await selectOwnerRow(db, userId, selector);
  if (!row) return null;

  const stale =
    !row.last_checked_at ||
    Date.now() - Date.parse(row.last_checked_at) > SYNC_INTERVAL_MS;
  if (config && isOpenPaymentStatus(row.status) && stale) {
    const result = await syncPaymentWithKeepz(db, config, row.id);
    if (result.outcome !== "unavailable") {
      const fresh = await selectOwnerRow(db, userId, { id: row.id });
      if (fresh) return toOwnerView(fresh);
    }
  }
  return toOwnerView(row);
}
