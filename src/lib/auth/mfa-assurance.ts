type AssuranceLevelResult = {
  data: { currentLevel: string | null } | null;
  error: unknown;
};

export type AssuranceLevelVerifier = {
  mfa: {
    getAuthenticatorAssuranceLevel(): Promise<AssuranceLevelResult>;
  };
};

// getAuthenticatorAssuranceLevel() called with no jwt (as every caller here
// does) falls through to auth-js's own getSession(), which triggers a network
// token refresh (POST /auth/v1/token) whenever the current access token has
// expired. That fetch goes through timeoutFetch's 25s /auth/v1/* floor
// (src/lib/with-timeout.ts) — the same shape already fixed for getCurrentUser()
// via GET_USER_TIMEOUT_MS (src/lib/auth/current-user.ts). This check always
// runs AFTER getCurrentUser()/getCurrentProfile() have already resolved in the
// same request, so on the exact failure being guarded against (expired token,
// slow refresh) that earlier call already spent up to its own 5s timeout
// before falling back. Racing this second, independent auth round trip against
// another 5s would push the request's serial auth timeouts alone past
// SERVER_FETCH_TIMEOUT_MS's ~10s real execution budget. 2.5s matches this
// project's other "secondary check, must not blow the page's budget"
// precedent (DETAIL_AUX_TIMEOUT_MS). When the token isn't expired this call
// does no network I/O at all, so the short budget never affects a healthy
// request — only the broken one.
const AAL2_CHECK_TIMEOUT_MS = 2_500;
const AAL2_CHECK_TIMED_OUT = Symbol("isAal2Verified-timeout");

/**
 * Whether the current session has completed step-up MFA (AAL2), gating admin
 * access (contract C8). Fails closed: a timeout or error resolves to `false`,
 * never `true` — there is no local signal for "has this admin verified a
 * second factor" that can substitute for the real check, so an unverifiable
 * result must never grant elevated access.
 */
export async function isAal2Verified(
  auth: AssuranceLevelVerifier,
  timeoutMs = AAL2_CHECK_TIMEOUT_MS,
): Promise<boolean> {
  // Timeout race is inlined (rather than importing the shared withTimeout
  // helper from with-timeout.ts) so this module has no "@/" alias imports,
  // matching verified-session-user.ts — both are exercised directly by
  // `node --test`, which cannot resolve the bundler-only "@/" path alias.
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<typeof AAL2_CHECK_TIMED_OUT>((resolve) => {
    timer = setTimeout(() => resolve(AAL2_CHECK_TIMED_OUT), timeoutMs);
  });
  try {
    const result = await Promise.race([
      auth.mfa.getAuthenticatorAssuranceLevel(),
      timeout,
    ]);
    if (result === AAL2_CHECK_TIMED_OUT) return false;
    return result.data?.currentLevel === "aal2";
  } finally {
    clearTimeout(timer);
  }
}
