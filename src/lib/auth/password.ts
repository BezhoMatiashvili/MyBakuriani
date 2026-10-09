// Keep client-side signup/recovery validation aligned. The authoritative
// password policy must also be configured in Supabase Auth so direct API calls
// cannot bypass this UI boundary.
export const MIN_PASSWORD_LENGTH = 12;

export type PasswordChangeErrorKey =
  | "wrongCurrent"
  | "samePassword"
  | "leakedPassword"
  | "weakPassword"
  | "tooManyAttempts"
  | "reauthenticate"
  | "network"
  | "generic";

/**
 * Message key for a failed password change from the settings card
 * (`useAuth().changePassword`): the sign-in with the current password, then
 * `updateUser({ password })`. Pure, so scripts/unit can load it.
 */
export function passwordChangeErrorKey(err: unknown): PasswordChangeErrorKey {
  const e = (err ?? {}) as {
    code?: unknown;
    status?: unknown;
    name?: unknown;
    reasons?: unknown;
  };
  // Network failure, timeoutFetch abort, or a 502-504 from the gateway.
  if (e.name === "AuthRetryableFetchError") return "network";
  const code = typeof e.code === "string" ? e.code : "";
  const status = typeof e.status === "number" ? e.status : 0;
  switch (code) {
    case "invalid_credentials":
      return "wrongCurrent";
    case "same_password":
      return "samePassword";
    case "weak_password":
      // Leaked-password protection answers "pwned" whatever the length.
      return Array.isArray(e.reasons) && e.reasons.includes("pwned")
        ? "leakedPassword"
        : "weakPassword";
    case "over_request_rate_limit":
      return "tooManyAttempts";
    // Only with the hosted "secure password change" setting and a session
    // over 24 h old; the sign-in before the update normally prevents it.
    case "reauthentication_needed":
      return "reauthenticate";
  }
  if (status === 429) return "tooManyAttempts";
  return "generic";
}
