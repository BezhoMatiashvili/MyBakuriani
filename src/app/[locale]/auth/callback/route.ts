import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { safeInternalPath } from "@/lib/security";
import { postAuthRedirectPath } from "../post-auth-redirect";

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

      return redirect(await postAuthRedirectPath(supabase, next));
    }
  }

  if (next === "/auth/reset-password") {
    return redirect("/auth/forgot-password?error=invalid_link");
  }
  // GoTrue appends error_code to the redirect of an expired or already-used
  // email link. Every other error (a cancelled Google consent arrives as
  // error=access_denied) keeps the plain bounce to the login page.
  if (searchParams.get("error_code") === "otp_expired") {
    return redirect("/auth/login?error=invalid_link");
  }
  return redirect("/auth/login");
}
