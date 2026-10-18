/**
 * Status vocabularies on both sides of the Keepz integration.
 *
 * The Keepz → payment/refund mapping itself lives in ONE place, the SQL
 * function keepz_apply_payment_status, which holds the row lock. These lists
 * exist so routes can reject junk before calling it, and so
 * scripts/check-db-contracts.mjs can compare PAYMENT_STATUSES and
 * REFUND_STATUSES with the table CHECKs.
 *
 * Pure module (no imports) so scripts/unit can load it.
 */

/** Every status GET /api/integrator/order/status can return (Keepz docs). */
export const KEEPZ_ORDER_STATUSES = [
  "INITIAL",
  "PROCESSING",
  "SUCCESS",
  "FAILED",
  "CANCELED",
  "EXPIRED",
  "REFUND_REQUESTED",
  "PARTIALLY_REFUNDED",
  "REFUNDED_BY_OPERATOR",
  "REFUNDED_BY_INTEGRATOR",
  "REFUNDED_BY_KEEPZ",
  "REFUNDED_FAILED",
] as const;
export type KeepzOrderStatus = (typeof KEEPZ_ORDER_STATUSES)[number];

export function isKeepzOrderStatus(value: unknown): value is KeepzOrderStatus {
  return (
    typeof value === "string" &&
    (KEEPZ_ORDER_STATUSES as readonly string[]).includes(value)
  );
}

/** public.payments.status — must equal the table CHECK. */
export const PAYMENT_STATUSES = [
  "pending",
  "succeeded",
  "declined",
  "cancelled",
  "expired",
] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

/**
 * Keepz can still report SUCCESS for these: `declined` is a failed attempt the
 * payer may retry on the same checkout page. Polling and the sweeper only ask
 * Keepz about open payments; a verified SUCCESS still credits from any state.
 */
export function isOpenPaymentStatus(status: string): boolean {
  return status === "pending" || status === "declined";
}

/** public.payment_refunds.status — must equal the table CHECK. */
export const REFUND_STATUSES = [
  "requested",
  "submitted",
  "succeeded",
  "failed",
  "unknown",
] as const;
export type RefundStatus = (typeof REFUND_STATUSES)[number];
