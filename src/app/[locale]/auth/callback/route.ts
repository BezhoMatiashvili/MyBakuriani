import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { withRetry } from "@/lib/with-timeout";
import { safeInternalPath } from "@/lib/security";

function safeNextPath(raw: string | null): string | null {
  return safeInternalPath(raw);
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = safeNextPath(searchParams.get("next"));

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      if (next === "/auth/reset-password") {
        return NextResponse.redirect(`${origin}${next}`);
      }

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

  if (next === "/auth/reset-password") {
    return NextResponse.redirect(
      `${origin}/auth/forgot-password?error=invalid_link`,
    );
  }
  return NextResponse.redirect(`${origin}/auth/login`);
}
