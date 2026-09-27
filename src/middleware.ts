import createIntlMiddleware from "next-intl/middleware";
import { NextRequest, NextResponse } from "next/server";
import { routing } from "./i18n/routing";
import { hasSupabaseAuthCookie } from "@/lib/supabase/auth-cookies";
import { updateSession } from "@/lib/supabase/middleware";
import { isAllowedMutationOrigin } from "@/lib/security";
import { KEEPZ_ORIGINLESS_POST_PATHS } from "@/lib/payments/keepz/server-paths";
import { EMAIL_ORIGINLESS_POST_PATHS } from "@/lib/email/server-paths";
import { SUPABASE_MEDIA_HOSTS, SUPABASE_PROJECT_HOST } from "@/lib/media-hosts";

const intlMiddleware = createIntlMiddleware(routing);
const ORIGINAL_REQUEST_PATH_HEADER = "x-mybakuriani-request-path";

// Password gate for closing the public site to browsing while keeping /api/*
// and static assets (excluded by config.matcher below) reachable. Active only
// when SITE_LOCKED="true" — a server-only env var set on the target deployment,
// never committed. The bypass link's path segment is SITE_LOCK_PASSWORD itself
// (never a separate hardcoded value) so there is exactly one secret, and it
// stays rotatable via env var alone — no code change or redeploy to change it.
const SITE_LOCK_COOKIE = "mb_gate";
const SITE_LOCK_PATH = "/site-locked";
// request.nextUrl follows X-Forwarded-Proto, so behind a proxy that sets it the
// request already reads as https; the configured site origin (inlined at build)
// keeps the cookie Secure when a proxy does not. Local http://localhost builds
// keep a non-Secure cookie.
const SITE_IS_HTTPS =
  process.env.NEXT_PUBLIC_SITE_URL?.startsWith("https://") ?? false;

// Compares a request-supplied value with the site-lock password in time that
// depends only on the password's length: no early exit at the first differing
// character. The middleware runs on the edge runtime, where node:crypto's
// timingSafeEqual is unavailable. Reads past the end of `value` are NaN, which
// XOR treats as 0; the length term already fails such a compare.
function constantTimeEqual(value: string, secret: string): boolean {
  let diff = value.length ^ secret.length;
  for (let i = 0; i < secret.length; i++) {
    diff |= value.charCodeAt(i) ^ secret.charCodeAt(i);
  }
  return diff === 0;
}

// The consent backstop requireConsent() redirects into. Like SITE_LOCK_PATH it
// lives outside src/app/[locale]/ and must bypass next-intl entirely, or the
// locale middleware would try to prefix-route it.
const CONSENT_REQUIRED_PATH = "/consent-required";

// Public listing detail routes are ISR and cookie-free; owner/admin preview of
// a pending listing lives under the force-dynamic /preview/<kind>/[id] routes.
// A ?preview=1 link (see listingUrls.ts) from a signed-in browser is rewritten
// there internally, so the address bar keeps the public URL. The param — not a
// bare cookie check — is what makes this reliable behind Cloudflare: it forms a
// distinct cache key, so the request always reaches the origin/middleware.
const PREVIEW_DETAIL_RE =
  /^\/(apartments|hotels|sales|food|services|entertainment|transport|employment)\/[^/]+$/;

function stripLocalePrefix(pathname: string): string {
  return routing.locales.reduce(
    (path, locale) =>
      path.startsWith(`/${locale}/`) || path === `/${locale}`
        ? path.replace(`/${locale}`, "") || "/"
        : path,
    pathname,
  );
}

// The Supabase origins media and API calls may use (C6): the configured project
// and the prod media host, from the same list next.config.ts gives the image
// optimizer. Never a *.supabase.co wildcard, which admitted every project.
const SUPABASE_ORIGINS = SUPABASE_MEDIA_HOSTS.map(
  (host) => `https://${host}`,
).join(" ");

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
      `img-src 'self' data: blob: ${SUPABASE_ORIGINS} https://images.unsplash.com`,
      "font-src 'self' data:",
      `connect-src 'self' ${SUPABASE_ORIGINS} wss://${SUPABASE_PROJECT_HOST} https://challenges.cloudflare.com https://api.mapbox.com https://events.mapbox.com`,
      `media-src 'self' ${SUPABASE_ORIGINS}`,
      // Mapbox GL JS spins up its tile/render worker from a blob: URL. With no
      // worker-src directive, browsers fall back to script-src, which has no
      // blob: — the map silently fails to render without this.
      "worker-src 'self' blob:",
      "frame-src https://challenges.cloudflare.com https://rtsp.me",
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

function applyBaselineSecurityHeaders(
  response: Response,
  secureRequest: boolean,
) {
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
  const secureRequest = request.nextUrl.protocol === "https:";
  const isApi = request.nextUrl.pathname.startsWith("/api/");
  const unsafeMethod = !["GET", "HEAD", "OPTIONS"].includes(request.method);
  if (isApi) {
    // API routes use Supabase cookies. Reject cross-site writes before route code
    // can read a body or invoke a privileged service client. The Keepz callback
    // and reconcile routes are server to server (no Origin) and cookie-free, so
    // exactly those paths are exempt (C32); so are the email dispatcher and the
    // Resend webhook (C33).
    const originlessPost =
      request.method === "POST" &&
      (KEEPZ_ORIGINLESS_POST_PATHS.includes(request.nextUrl.pathname) ||
        EMAIL_ORIGINLESS_POST_PATHS.includes(request.nextUrl.pathname));
    if (
      unsafeMethod &&
      !originlessPost &&
      !isAllowedMutationOrigin(request.headers.get("origin"))
    ) {
      return applyBaselineSecurityHeaders(
        NextResponse.json({ error: "invalid_origin" }, { status: 403 }),
        secureRequest,
      );
    }
    return applyBaselineSecurityHeaders(NextResponse.next(), secureRequest);
  }

  const pathname = request.nextUrl.pathname;

  // The gate page itself always bypasses locale routing, same as /api/*.
  if (pathname === SITE_LOCK_PATH) {
    const response = NextResponse.next();
    response.headers.set("Cache-Control", "no-store");
    return applySecurityHeaders(response, secureRequest);
  }

  if (process.env.SITE_LOCKED === "true") {
    const password = process.env.SITE_LOCK_PASSWORD;

    // Visiting the shareable bypass link (the password itself, as a path
    // segment) unlocks this browser and sends it home.
    if (
      password &&
      constantTimeEqual(stripLocalePrefix(pathname), `/${password}`)
    ) {
      const response = NextResponse.redirect(new URL("/", request.url));
      response.headers.set("Cache-Control", "no-store");
      response.cookies.set(SITE_LOCK_COOKIE, password, {
        httpOnly: true,
        secure: secureRequest || SITE_IS_HTTPS,
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 24 * 30,
      });
      return applyBaselineSecurityHeaders(response, secureRequest);
    }

    const unlocked =
      !!password &&
      constantTimeEqual(
        request.cookies.get(SITE_LOCK_COOKIE)?.value ?? "",
        password,
      );

    if (!unlocked) {
      const target = new URL(SITE_LOCK_PATH, request.url);
      target.searchParams.set("from", pathname + request.nextUrl.search);
      const response = NextResponse.redirect(target);
      response.headers.set("Cache-Control", "no-store");
      return applyBaselineSecurityHeaders(response, secureRequest);
    }
  }

  // Bypasses locale routing like the site-lock page, but deliberately placed
  // AFTER the SITE_LOCKED block so a locked site still hides it.
  if (pathname === CONSENT_REQUIRED_PATH) {
    const response = NextResponse.next();
    response.headers.set("Cache-Control", "no-store");
    return applySecurityHeaders(response, secureRequest);
  }

  const requestHeaders = new Headers(request.headers);
  // This value is deliberately overwritten rather than forwarded from the
  // browser. Server layouts use it for post-auth redirects, so it must reflect
  // the actual request (including locale and query string), not user input.
  requestHeaders.set(
    ORIGINAL_REQUEST_PATH_HEADER,
    request.nextUrl.pathname + request.nextUrl.search,
  );
  // Internal rewrite to the force-dynamic preview route for signed-in
  // ?preview=1 requests on a listing detail path (see PREVIEW_DETAIL_RE note).
  let previewPath: string | null = null;
  if (
    request.nextUrl.searchParams.has("preview") &&
    hasSupabaseAuthCookie(request)
  ) {
    const bare = stripLocalePrefix(pathname);
    if (PREVIEW_DETAIL_RE.test(bare)) {
      // Keep the original locale prefix form — localePrefix is "as-needed".
      const localePrefix = pathname.slice(0, pathname.length - bare.length);
      previewPath = `${localePrefix}/preview${bare}`;
    }
  }

  const routedRequest = previewPath
    ? new NextRequest(
        new URL(previewPath + request.nextUrl.search, request.url),
        { headers: requestHeaders },
      )
    : new NextRequest(request, { headers: requestHeaders });

  // Run next-intl middleware first to handle locale routing
  const intlResponse = intlMiddleware(routedRequest);

  // The detail pages' edge-cache header comes from next.config.ts headers()
  // (C28), not from here: a middleware header always beats a next.config one,
  // so setting it here would override the no-store that next.config gives RSC
  // requests without `_rsc`. That rule's `missing: preview` test treats a bare
  // `?preview` as absent, so pin the signed-in preview render as uncacheable
  // here, with the exact header Next gives the force-dynamic /preview routes.
  if (previewPath) {
    intlResponse.headers.set(
      "Cache-Control",
      "private, no-cache, no-store, max-age=0, must-revalidate",
    );
  }

  // For protected routes, also run Supabase session check.
  // Strip locale prefix to check the actual route
  const pathnameWithoutLocale = stripLocalePrefix(pathname);

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

  return applySecurityHeaders(intlResponse, secureRequest);
}

export const config = {
  matcher: "/((?!trpc|_next|_vercel|.*\\..*).*)",
};
