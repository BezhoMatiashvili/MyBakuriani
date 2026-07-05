import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { withRetry } from "@/lib/with-timeout";

// Only allow same-origin, absolute paths. Reject protocol-relative (`//host`)
// and backslash-prefixed forms (`/\\host`) that some browsers treat as external.
function safeNextPath(raw: string | null): string | null {
  if (!raw) return null;
  if (!raw.startsWith("/")) return null;
  if (raw.startsWith("//") || raw.startsWith("/\\")) return null;
  return raw;
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = safeNextPath(searchParams.get("next"));

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        const { data: profile, error: profileError } = await withRetry(() =>
          supabase
            .from("profiles")
            .select("role")
            .eq("id", user.id)
            .maybeSingle(),
        );

        if (profileError) {
          // Couldn't confirm the profile even after a retry — a DB blip, not
          // proof the account has no profile. Don't bounce a signed-in user
          // to registration on a transient failure.
          return NextResponse.redirect(`${origin}/dashboard/guest`);
        }
        if (!profile) {
          return NextResponse.redirect(`${origin}/auth/register`);
        }

        const rolePaths: Record<string, string> = {
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
        const dashboardPath = rolePaths[profile.role] ?? "/dashboard/guest";
        const target = next ?? dashboardPath;
        return NextResponse.redirect(`${origin}${target}`);
      }
    }
  }

  return NextResponse.redirect(`${origin}/auth/login`);
}
