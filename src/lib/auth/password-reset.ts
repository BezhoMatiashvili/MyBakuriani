// Password reset (C51). Pure: no "@/" imports, so
// scripts/unit/password-reset.test.mjs can load it with
// node --experimental-strip-types.

// GoTrue lets one address receive a recovery email once per
// `smtp_max_frequency` (60 s by default); C36's confirmation resend uses the
// same window.
export const RESET_RESEND_SECONDS = 60;

export type ResetRequestOutcome =
  /** A link went out now, or one went to this address under `resendIn` s ago. */
  | { kind: "sent"; resendIn: number }
  /** The project's hourly email budget is spent: nothing was sent. */
  | { kind: "mailUnavailable" }
  /** GoTrue's per-IP limit on /recover. */
  | { kind: "ipLimited" }
  /** The request never got an answer (network, timeout, 502-504). */
  | { kind: "network" };

/**
 * What a `resetPasswordForEmail` result means for the person on the page.
 *
 * GoTrue answers 429 `over_email_send_rate_limit` in two cases. "For security
 * purposes, you can only request this after N seconds." means a link already
 * went to this address moments ago, so the page shows the sent state with a
 * countdown instead of an error (it is also only ever said for an existing
 * address, so an error there would reveal which addresses have an account).
 * Without the seconds it is the project-wide email cap, and nothing was sent.
 * Any other refusal keeps the neutral sent state, as before.
 */
export function resetRequestOutcome(err: unknown): ResetRequestOutcome {
  if (!err) return { kind: "sent", resendIn: RESET_RESEND_SECONDS };
  const e = err as {
    message?: unknown;
    code?: unknown;
    status?: unknown;
    name?: unknown;
  };
  if (e.name === "AuthRetryableFetchError") return { kind: "network" };
  const message = typeof e.message === "string" ? e.message : "";
  const code = typeof e.code === "string" ? e.code : "";
  const status = typeof e.status === "number" ? e.status : 0;

  const seconds = Number(/after (\d+) seconds?/i.exec(message)?.[1]);
  if (Number.isInteger(seconds) && seconds > 0) {
    return { kind: "sent", resendIn: Math.min(seconds, 3600) };
  }
  if (code === "over_email_send_rate_limit") return { kind: "mailUnavailable" };
  if (code === "over_request_rate_limit" || status === 429) {
    return { kind: "ipLimited" };
  }
  return { kind: "sent", resendIn: RESET_RESEND_SECONDS };
}

/**
 * The token of a recovery link built from the hosted "Reset password"
 * template (`{{ .SiteURL }}/auth/reset-password?token_hash={{ .TokenHash }}&type=recovery`),
 * or null. The page verifies it only when the new password is submitted, so a
 * mail scanner's prefetch cannot spend it, and it needs no PKCE verifier, so
 * the link works in any browser.
 */
export function recoveryTokenHash(params: URLSearchParams): string | null {
  const tokenHash = params.get("token_hash");
  const type = params.get("type");
  if (!tokenHash || (type !== null && type !== "recovery")) return null;
  return tokenHash;
}
