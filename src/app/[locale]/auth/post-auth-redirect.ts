import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";
import { withRetry } from "@/lib/with-timeout";

const ROLE_DASHBOARD: Record<string, string> = {
  admin: "/dashboard/admin",
  renter: "/dashboard/renter",
  seller: "/dashboard/seller",
  cleaner: "/dashboard/cleaner",
  food: "/dashboard/food",
  entertainment: "/dashboard/entertainment",
  transport: "/dashboard/transport",
  employment: "/dashboard/employment",
  handyman: "/dashboard/services",
};

/**
 * Where /auth/callback (OAuth, PKCE code, on the server) and the /auth/confirm
 * page (email link, in the browser) send a user once the session is set. No
 * profiles row yet means the registration wizard, which creates it with this
 * session. `next` must already have passed safeInternalPath().
 */
export async function postAuthRedirectPath(
  supabase: SupabaseClient<Database>,
  next: string | null,
): Promise<string> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return "/auth/login";

  const { data: profile, error: profileError } = await withRetry(() =>
    supabase.from("profiles").select("role").eq("id", user.id).maybeSingle(),
  );

  if (profileError) {
    // Couldn't confirm the profile even after a retry — a DB blip, not
    // proof the account has no profile. Don't bounce a signed-in user
    // to registration on a transient failure.
    return "/dashboard/guest";
  }
  if (!profile) return "/auth/register";

  return next ?? ROLE_DASHBOARD[profile.role] ?? "/dashboard/guest";
}
