// Daily notification-email budget (C33). Kept free of imports so scripts/unit
// can load it straight from src/.
//
// Every emailed notification type has a priority class in SQL
// (public.email_notification_priority): 1 = payment receipts and refunds,
// membership and payment-review decisions; 2 = everything else; 3 = types
// other users (or the recipient) can trigger at will, also capped per
// recipient at enqueue. email_claim_batch claims class 1 first and
// takes at most `shared` rows of classes 2-3, so the last quarter of the daily
// cap only ever goes to class 1.

/** Emails per day that only class-1 mail may use. */
export function criticalReserve(dailyCap: number): number {
  return Math.ceil(dailyCap / 4);
}

/**
 * How many rows the next claim may take: `total` of any class, of which at
 * most `shared` from classes 2-3 (they stop once today's sends reach the cap
 * minus the class-1 reserve).
 */
export function claimRoom(
  dailyCap: number,
  sentToday: number,
  batch: number,
): { total: number; shared: number } {
  const total = Math.max(0, Math.min(batch, dailyCap - sentToday));
  const shared = Math.max(
    0,
    Math.min(total, dailyCap - criticalReserve(dailyCap) - sentToday),
  );
  return { total, shared };
}
