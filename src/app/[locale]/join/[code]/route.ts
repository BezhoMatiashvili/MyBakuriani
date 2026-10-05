import { NextResponse } from "next/server";
import { hasLocale } from "next-intl";
import { routing } from "@/i18n/routing";
import { getCurrentUser } from "@/lib/auth/current-user";
import { createServiceClient } from "@/lib/supabase/admin";
import {
  SIGNUP_LINK_COOKIE,
  SIGNUP_LINK_COOKIE_MAX_AGE_SECONDS,
  normalizeSignupLinkCode,
  validateSignupLinkDestination,
} from "@/lib/signup-links";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Same origin rule as /auth/callback: request.url is the container's internal
// address behind DigitalOcean's proxy.
const SITE_ORIGIN =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://my-bakuriani.vercel.app";

/**
 * An admin's sign-up link (C41). A valid code is remembered in a cookie for the
 * registration wizard; a signed-out visitor lands on the sign-up form (an
 * existing account that signs in there by email goes to the destination via
 * `next`), a signed-in one goes straight to the destination. An unknown or
 * deactivated code is just the sign-up form.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ locale: string; code: string }> },
) {
  const { locale, code: rawCode } = await params;
  const prefix =
    hasLocale(routing.locales, locale) && locale !== routing.defaultLocale
      ? `/${locale}`
      : "";
  const signUp = `${prefix}/auth/login?mode=register`;

  const code = normalizeSignupLinkCode(rawCode);
  let destination: string | null = null;
  if (code) {
    const { data } = await createServiceClient()
      .from("signup_links")
      .select("destination")
      .eq("code", code)
      .eq("is_active", true)
      .maybeSingle();
    destination = validateSignupLinkDestination(data?.destination);
  }
  if (!code || !destination) return redirect(signUp);

  const user = await getCurrentUser();
  const response = redirect(
    user
      ? `${prefix}${destination}`
      : `${signUp}&next=${encodeURIComponent(destination)}`,
  );
  response.cookies.set(SIGNUP_LINK_COOKIE, code, {
    path: "/",
    maxAge: SIGNUP_LINK_COOKIE_MAX_AGE_SECONDS,
    sameSite: "lax",
    secure: SITE_ORIGIN.startsWith("https://"),
    // The sign-up form reads it to copy the code into user_metadata.
    httpOnly: false,
  });
  return response;
}

function redirect(path: string) {
  const response = NextResponse.redirect(new URL(path, SITE_ORIGIN));
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
