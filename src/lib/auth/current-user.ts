import { cache } from "react";
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
  } = await supabase.auth.getUser();
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
