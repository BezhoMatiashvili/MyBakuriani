import { cache } from "react";
import { isAuthRetryableFetchError } from "@supabase/supabase-js";
import { getVerifiedSessionUser } from "@/lib/auth/verified-session-user";
import { createClient } from "@/lib/supabase/server";
import { withTimeout } from "@/lib/with-timeout";

/**
 * Request-memoized current user. React `cache()` dedupes the Supabase Auth
 * round-trip across the layout, the page, and any helpers (is-admin-viewer,
 * require-admin, dashboards) within a single server render — so a request that
 * previously paid for getUser() two or three times now pays for it once.
 *
 * `getUser()` verifies the JWT against the Auth server, so this remains the
 * security-grade check (unlike getSession(), which only reads the cookie).
 */

// getUser() is a remote round-trip to Supabase's Auth service — the same call
// this project's own history already flagged as "the un-pinnable edge auth
// hop" and routed middleware around (see db-slowness-region-mismatch notes).
// timeoutFetch's own floor for any /auth/v1/* request is 25s (kept generous
// there so the *login page's* OTP/token calls aren't aborted mid-flight), but
// that is longer than a single request's real execution budget (~10s — see
// SERVER_FETCH_TIMEOUT_MS's comment in supabase/server.ts). On a slow-but-not-
// dead mobile connection, waiting up to 25s here risks the platform killing
// the whole request before this function ever gets to fall back — leaving the
// client's navigation stuck with no clean resolution. Racing this one call
// against a much shorter budget lets the already-correct, fast, local
// getVerifiedSessionUser() fallback (below) run in time instead.
const GET_USER_TIMEOUT_MS = 5_000;
const GET_USER_TIMED_OUT = Symbol("getCurrentUser-timeout");

export const getCurrentUser = cache(async () => {
  const supabase = await createClient();
  const result = await withTimeout<
    | Awaited<ReturnType<typeof supabase.auth.getUser>>
    | typeof GET_USER_TIMED_OUT
  >(supabase.auth.getUser(), GET_USER_TIMEOUT_MS, GET_USER_TIMED_OUT);

  // getUser() resolves to { user: null, error } on a transient network/timeout
  // abort instead of throwing, and auth-js keeps the session (only a real
  // AuthSessionMissingError signs out). Returning that null would make every
  // dashboard guard (`if (!user) redirect("/auth/login")`) boot a still-valid
  // session. Verify the cookie token locally through getClaims() before using
  // its embedded user: getSession() alone parses client-controlled storage and
  // is not an authorization-grade identity.
  if (result === GET_USER_TIMED_OUT) {
    return getVerifiedSessionUser(supabase.auth);
  }
  const {
    data: { user },
    error,
  } = result;
  if (!user && isAuthRetryableFetchError(error)) {
    return getVerifiedSessionUser(supabase.auth);
  }
  return user;
});

/**
 * Request-memoized profile (id, role, display_name, avatar_url) for the current
 * user, reusing the cached user. Returns null when signed out.
 */
export const getCurrentProfile = cache(async () => {
  const user = await getCurrentUser();
  if (!user) return null;

  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("id, role, display_name, avatar_url")
    .eq("id", user.id)
    .maybeSingle();
  return data;
});
