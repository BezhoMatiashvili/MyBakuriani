// site_settings `sms_marketing_gates` (C18): consent-request and win-back texts stay paused
// until the owner's lawyer approves them (technical task 2026-10-25). Only an explicit true
// opens a gate; no row, no key or any other value is paused. Same rule as SQL
// sms_marketing_gate_open (value ->> gate = 'true'), which the dispatcher and the
// automation run use.
export const SMS_MARKETING_GATES_KEY = "sms_marketing_gates";

export type SmsMarketingGate = "consent_requests" | "win_back";

export function smsMarketingGateOpen(
  value: unknown,
  gate: SmsMarketingGate,
): boolean {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const flag = (value as Record<string, unknown>)[gate];
  return flag === true || flag === "true";
}
