import createIntlMiddleware from "next-intl/middleware";
import { NextRequest, NextResponse } from "next/server";
import { routing } from "./i18n/routing";
import { updateSession } from "@/lib/supabase/middleware";
import { isAllowedMutationOrigin } from "@/lib/security";

const intlMiddleware = createIntlMiddleware(routing);
const ORIGINAL_REQUEST_PATH_HEADER = "x-mybakuriani-request-path";

function applySecurityHeaders(response: Response, secureRequest: boolean) {
  // script-src/style-src keep 'unsafe-inline': next-themes and Next's bootstrap
  // inject inline scripts/styles without a nonce, and the nonce was never wired
  // into Next's renderer (strict-dynamic then blocked every script). Mirrors the
  // known-good policy previously shipped from next.config.ts.
  response.headers.set(
    "Content-Security-Policy",
    [
      "default-src 'self'",
      `script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""} https://challenges.cloudflare.com`,
      "script-src-attr 'none'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https://*.supabase.co https://images.unsplash.com https://*.basemaps.cartocdn.com",
      "font-src 'self' data:",
      "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://challenges.cloudflare.com",
      "media-src 'self' https://*.supabase.co",
      "frame-src https://challenges.cloudflare.com",
      "object-src 'none'",
      "manifest-src 'self'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
      ...(process.env.NODE_ENV === "production" && secureRequest
        ? ["upgrade-insecure-requests"]
        : []),
    ].join("; "),
  );
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("Cross-Origin-Opener-Policy", "same-origin");
  response.headers.set("Cross-Origin-Resource-Policy", "same-site");
  response.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(self)",
  );
  if (process.env.NODE_ENV === "production" && secureRequest) {
    response.headers.set(
      "Strict-Transport-Security",
      "max-age=63072000; includeSubDomains; preload",
    );
  }
  return response;
}

function applyBaselineSecurityHeaders(response: Response, secureRequest: boolean) {
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("Cross-Origin-Opener-Policy", "same-origin");
  response.headers.set("Cross-Origin-Resource-Policy", "same-site");
  response.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(self)",
  );
  if (process.env.NODE_ENV === "production" && secureRequest) {
    response.headers.set(
      "Strict-Transport-Security",
      "max-age=63072000; includeSubDomains; preload",
    );
  }
  return response;
}

export async function middleware(request: NextRequest) {
  const isApi = request.nextUrl.pathname.startsWith("/api/");
  const unsafeMethod = !["GET", "HEAD", "OPTIONS"].includes(request.method);
  if (isApi) {
    const secureRequest = request.nextUrl.protocol === "https:";
    // API routes use Supabase cookies. Reject cross-site writes before route code
    // can read a body or invoke a privileged service client.
    if (
      unsafeMethod &&
      !isAllowedMutationOrigin(request.headers.get("origin"))
    ) {
      return applyBaselineSecurityHeaders(
        NextResponse.json({ error: "invalid_origin" }, { status: 403 }),
        secureRequest,
      );
    }
    return applyBaselineSecurityHeaders(NextResponse.next(), secureRequest);
  }

  const requestHeaders = new Headers(request.headers);
  // This value is deliberately overwritten rather than forwarded from the
  // browser. Server layouts use it for post-auth redirects, so it must reflect
  // the actual request (including locale and query string), not user input.
  requestHeaders.set(
    ORIGINAL_REQUEST_PATH_HEADER,
    request.nextUrl.pathname + request.nextUrl.search,
  );
  const routedRequest = new NextRequest(request, { headers: requestHeaders });

  // Run next-intl middleware first to handle locale routing
  const intlResponse = intlMiddleware(routedRequest);

  // For protected routes, also run Supabase session check
  const pathname = routedRequest.nextUrl.pathname;

  // Strip locale prefix to check the actual route
  const pathnameWithoutLocale = routing.locales.reduce(
    (path, locale) =>
      path.startsWith(`/${locale}/`) || path === `/${locale}`
        ? path.replace(`/${locale}`, "") || "/"
        : path,
    pathname,
  );

  const isProtected =
    pathnameWithoutLocale.startsWith("/create") ||
    pathnameWithoutLocale.startsWith("/dashboard");

  if (isProtected) {
    // Run Supabase auth check — updateSession returns a response with session cookies
    const sessionResponse = await updateSession(routedRequest);

    // If updateSession redirected (e.g., to login), follow that redirect
    if (sessionResponse.headers.get("location")) {
      return applySecurityHeaders(
        sessionResponse,
        request.nextUrl.protocol === "https:",
      );
    }

    // Otherwise, merge session cookies into the intl response.
    // Pass the full cookie object so httpOnly/secure/sameSite/path/maxAge are preserved —
    // dropping these caused refreshed Supabase tokens to be unusable on the next request.
    sessionResponse.cookies.getAll().forEach((cookie) => {
      intlResponse.cookies.set(cookie);
    });
  }

  return applySecurityHeaders(
    intlResponse,
    request.nextUrl.protocol === "https:",
  );
}

export const config = {
  matcher: "/((?!trpc|_next|_vercel|.*\\..*).*)",
};
