// What one uBill /send reply means for a queued row (owner's technical task SMS-05..08,
// 2026-10-25). uBill has no idempotency key, so a reply that could follow a sent text is never
// sent again:
//   submitted  accepted with an smsID (charged when uBill accepts it, C18)
//   failed     the row's own fault (no valid number): not sent
//   unknown    maybe sent (unreadable 2xx, accepted without an id, network error or timeout,
//              5xx without a refusal): failed with outcome "unknown", never resent or charged
//   refused    uBill said no before sending (account, brand, credit, 4xx): released, retried
//              later with a back-off (sms_release_dispatch_claim)
import type { UbillSendReply } from "../_shared/ubill.ts";

// uBill send statusIDs. 0 = accepted. Only the "no valid number" family is the row's fault.
export const UBILL_ROW_ERRORS = new Set([20, 50]);

export type UnknownReason = "ambiguous_reply" | "network" | "server_error";

export type SendOutcome =
  | { kind: "submitted"; smsId: string }
  | { kind: "failed" }
  | { kind: "unknown"; reason: UnknownReason }
  | { kind: "refused" };

export function classifyReply(reply: UbillSendReply): SendOutcome {
  const refusal =
    reply.parsed && reply.statusID !== null && reply.statusID !== 0;
  if (refusal && UBILL_ROW_ERRORS.has(reply.statusID!)) {
    return { kind: "failed" };
  }
  if (reply.http >= 500) {
    // A gateway error can follow an accepted send; only a refusal in the body is sure.
    return refusal
      ? { kind: "refused" }
      : { kind: "unknown", reason: "server_error" };
  }
  if (reply.http < 200 || reply.http >= 300) return { kind: "refused" };
  if (!reply.parsed || reply.statusID === null) {
    return { kind: "unknown", reason: "ambiguous_reply" };
  }
  if (reply.statusID !== 0) return { kind: "refused" };
  return reply.smsID === null
    ? { kind: "unknown", reason: "ambiguous_reply" }
    : { kind: "submitted", smsId: String(reply.smsID) };
}
