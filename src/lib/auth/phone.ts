// Phone sign-in (C48). Pure: no "@/" imports, so scripts/unit/phone-auth.test.mjs
// can load it with node --experimental-strip-types.

// The Send SMS hook's refusal tokens. Same list as
// supabase/functions/_shared/auth-sms.ts (the app cannot import Deno modules
// at runtime); the unit test keeps the two equal.
export const AUTH_SMS_ERRORS = {
  phoneNotSupported: "phone_not_supported",
  numberLimit: "sms_limit_number",
  ipLimit: "sms_limit_ip",
  unavailable: "sms_unavailable",
  sendFailed: "sms_send_failed",
} as const;

// Phone sign-in shows only where the Supabase project has Phone + the hook
// configured (staging today). Inlined at build.
export function isPhoneAuthEnabled(): boolean {
  return process.env.NEXT_PUBLIC_PHONE_AUTH_ENABLED === "true";
}

/** PhoneInput's local value ("5XXXXXXXX") -> "+9955XXXXXXXX", else null. */
export function localToE164(local: string): string | null {
  const digits = local.replace(/\D/g, "");
  return /^5\d{8}$/.test(digits) ? `+995${digits}` : null;
}

export type PhoneAuthErrorKey =
  | "phoneNotSupported"
  | "numberLimit"
  | "ipLimit"
  | "unavailable"
  | "sendFailed"
  | "tooSoon"
  | "wrongCode"
  | "phoneTaken"
  | "timeout"
  | "generic";

const TOKEN_KEYS: Record<string, PhoneAuthErrorKey> = {
  [AUTH_SMS_ERRORS.phoneNotSupported]: "phoneNotSupported",
  [AUTH_SMS_ERRORS.numberLimit]: "numberLimit",
  [AUTH_SMS_ERRORS.ipLimit]: "ipLimit",
  [AUTH_SMS_ERRORS.unavailable]: "unavailable",
  [AUTH_SMS_ERRORS.sendFailed]: "sendFailed",
};

/**
 * Message key (PhoneOtp.errors.*) for a failed signInWithOtp / updateUser /
 * verifyOtp. Hook refusals arrive as the error message; GoTrue's own refusals
 * carry a `code`.
 */
export function phoneAuthErrorKey(err: unknown): PhoneAuthErrorKey {
  const e = (err ?? {}) as {
    message?: unknown;
    code?: unknown;
    status?: unknown;
    name?: unknown;
  };
  const message = typeof e.message === "string" ? e.message : "";
  const code = typeof e.code === "string" ? e.code : "";
  const status = typeof e.status === "number" ? e.status : 0;

  if (TOKEN_KEYS[message]) return TOKEN_KEYS[message];
  // Network failure, timeoutFetch abort, or a 502-504 from the gateway.
  if (e.name === "AuthRetryableFetchError") return "timeout";
  switch (code) {
    case "otp_expired":
      return "wrongCode";
    case "phone_exists":
      return "phoneTaken";
    case "over_sms_send_rate_limit":
    case "over_request_rate_limit":
      return "tooSoon";
    case "validation_failed":
      return "phoneNotSupported";
    case "phone_provider_disabled":
    case "sms_send_failed":
      return "unavailable";
  }
  if (code.startsWith("hook_")) return "sendFailed";
  if (status === 429) return "tooSoon";
  if (status >= 500) return "sendFailed";
  return "generic";
}
