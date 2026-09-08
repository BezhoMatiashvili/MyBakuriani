import { NextRequest, NextResponse } from "next/server";
import { safeInternalPath } from "@/lib/security";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";

const SITE_LOCK_COOKIE = "mb_gate";

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
      new URL(redirectTo, request.url),
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
    request.url,
  );
  const response = NextResponse.redirect(target, 303);
  response.headers.set("Cache-Control", "no-store");
  return response;
}
