import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { withRetry } from "@/lib/with-timeout";
import { safeInternalPath } from "@/lib/security";

// `request.url` in a Node.js-runtime route handler reflects the container's
// internal address (http://localhost:8080) behind DigitalOcean's proxy, NOT the
// external host — unlike middleware's Edge runtime. Redirecting off it sent
// every OAuth sign-in to http://localhost:8080/... . NEXT_PUBLIC_SITE_URL is
// this app's canonical-origin pattern (layout.tsx, robots.ts, sitemap.ts,
// api/site-lock/unlock) and is set per environment, so local lands on local,
// staging on staging and prod on prod.
const SITE_ORIGIN =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://my-bakuriani.vercel.app";

function redirect(path: string) {
  return NextResponse.redirect(new URL(path, SITE_ORIGIN));
}

function safeNextPath(raw: string | null): string | null {
  return safeInternalPath(raw);
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const next = safeNextPath(searchParams.get("next"));

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      if (next === "/auth/reset-password") {
        return redirect(next);
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
          return redirect("/dashboard/guest");
        }
        if (!profile) {
          return redirect("/auth/register");
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
        return redirect(target);
      }
    }
  }

  if (next === "/auth/reset-password") {
    return redirect("/auth/forgot-password?error=invalid_link");
  }
  return redirect("/auth/login");
}
