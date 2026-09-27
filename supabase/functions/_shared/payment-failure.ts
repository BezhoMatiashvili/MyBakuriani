/**
 * Whether a charge RPC error is a failed payment the buyer is notified about
 * (payment_failed, which is also emailed: C33). True when the database refused
 * the charge for lack of money or for the SUPER VIP rule (C23), or when the
 * charge failed server-side. Validation, ownership and not-found outcomes
 * (SQLSTATE classes 22, 23, 42 and P0, and PostgREST's own PGRST codes) are
 * answered in the HTTP response only, so a repeated bad request queues no mail.
 *
 * Imports nothing, so scripts/unit can test it under Node as well.
 */
export function isPaymentFailure(error: {
  message?: string;
  hint?: string;
  code?: string;
}): boolean {
  const message = error.message ?? "";
  if (
    error.hint === "insufficient_balance" ||
    message.includes("არასაკმარისი ბალანსი") ||
    message.includes("vip_tier_conflict")
  ) {
    return true;
  }
  return !/^(22|23|42|P0|PGRST)/.test(error.code ?? "");
}
