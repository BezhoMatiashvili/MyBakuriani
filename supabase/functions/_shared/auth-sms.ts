// Phone sign-in (C48): why the Send SMS hook refused to send a code. The hook
// returns the token as its error message and Supabase Auth hands it to the
// browser unchanged. src/lib/auth/phone.ts holds the same list (the app cannot
// import Deno modules at runtime); scripts/unit/phone-auth.test.mjs keeps the
// two equal.
export const AUTH_SMS_ERRORS = {
  phoneNotSupported: "phone_not_supported",
  numberLimit: "sms_limit_number",
  ipLimit: "sms_limit_ip",
  unavailable: "sms_unavailable",
  sendFailed: "sms_send_failed",
} as const;

export type AuthSmsError =
  (typeof AUTH_SMS_ERRORS)[keyof typeof AUTH_SMS_ERRORS];
