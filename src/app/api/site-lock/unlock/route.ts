import { NextRequest, NextResponse } from "next/server";
import { safeInternalPath } from "@/lib/security";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";

const SITE_LOCK_COOKIE = "mb_gate";

// request.url reflects the container's internal address (localhost:8080)
// behind DigitalOcean's proxy for Node.js route handlers — unlike middleware's
// Edge runtime, it is NOT corrected to the external host. Building redirect
// targets from request.url sent real visitors to https://localhost:8080/.
// NEXT_PUBLIC_SITE_URL is this app's own established pattern for the canonical
// external origin (see layout.tsx, robots.ts, sitemap.ts).
const SITE_ORIGIN =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://my-bakuriani.vercel.app";

export async function POST(request: NextRequest) {
  const allowed = await checkRateLimit(
    `site-lock-unlock:${getClientIp(request)}`,
    10,
    60 * 60 * 1000,
  );
  if (!allowed) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const form = await request.formData();
  const password = String(form.get("password") ?? "");
  const redirectTo = safeInternalPath(form.get("redirect")) ?? "/";

  const expected = process.env.SITE_LOCK_PASSWORD;
  if (expected && password === expected) {
    const response = NextResponse.redirect(
      new URL(redirectTo, SITE_ORIGIN),
      303,
    );
    response.headers.set("Cache-Control", "no-store");
    response.cookies.set(SITE_LOCK_COOKIE, expected, {
      httpOnly: true,
      secure: request.nextUrl.protocol === "https:",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });
    return response;
  }

  const target = new URL(
    `/site-locked?from=${encodeURIComponent(redirectTo)}&error=1`,
    SITE_ORIGIN,
  );
  const response = NextResponse.redirect(target, 303);
  response.headers.set("Cache-Control", "no-store");
  return response;
}
