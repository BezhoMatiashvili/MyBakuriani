import { cache } from "react";
import { isAuthRetryableFetchError } from "@supabase/supabase-js";
import { getVerifiedSessionUser } from "@/lib/auth/verified-session-user";
import { createClient } from "@/lib/supabase/server";

/**
 * Request-memoized current user. React `cache()` dedupes the Supabase Auth
 * round-trip across the layout, the page, and any helpers (is-admin-viewer,
 * require-admin, dashboards) within a single server render — so a request that
 * previously paid for getUser() two or three times now pays for it once.
 *
 * `getUser()` verifies the JWT against the Auth server, so this remains the
 * security-grade check (unlike getSession(), which only reads the cookie).
 */
export const getCurrentUser = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  // getUser() resolves to { user: null, error } on a transient network/timeout
  // abort instead of throwing, and auth-js keeps the session (only a real
  // AuthSessionMissingError signs out). Returning that null would make every
  // dashboard guard (`if (!user) redirect("/auth/login")`) boot a still-valid
  // session. Verify the cookie token locally through getClaims() before using
  // its embedded user: getSession() alone parses client-controlled storage and
  // is not an authorization-grade identity.
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
