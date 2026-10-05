import { cookies } from "next/headers";
import { getCurrentUser } from "@/lib/auth/current-user";
import { createServiceClient } from "@/lib/supabase/admin";
import {
  SIGNUP_LINK_COOKIE,
  SIGNUP_LINK_METADATA_KEY,
  normalizeSignupLinkCode,
  validateSignupLinkDestination,
} from "@/lib/signup-links";

export const runtime = "nodejs";

/**
 * Where the registration wizard sends a new user who came through an admin's
 * sign-up link (C41): the code from the sign-up's user_metadata (set on any
 * device) or else the /join cookie, looked up again here. Answers
 * `{ destination: null }` when there is no active link. Clears the cookie; the
 * wizard, the only caller, runs once per account.
 */
export async function POST() {
  const user = await getCurrentUser();
  if (!user) {
    return Response.json({ error: "unauthenticated" }, { status: 401 });
  }

  // getCurrentUser's timeout fallback carries no metadata: cookie only then.
  const metadata = "user_metadata" in user ? user.user_metadata : undefined;
  const fromMetadata =
    metadata && typeof metadata === "object"
      ? (metadata as Record<string, unknown>)[SIGNUP_LINK_METADATA_KEY]
      : undefined;
  const cookieStore = await cookies();
  const code =
    normalizeSignupLinkCode(fromMetadata) ??
    normalizeSignupLinkCode(cookieStore.get(SIGNUP_LINK_COOKIE)?.value);
  cookieStore.delete(SIGNUP_LINK_COOKIE);
  if (!code) return Response.json({ destination: null });

  const { data, error } = await createServiceClient()
    .from("signup_links")
    .select("destination")
    .eq("code", code)
    .eq("is_active", true)
    .maybeSingle();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({
    destination: validateSignupLinkDestination(data?.destination),
  });
}
