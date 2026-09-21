import { createServerClient } from "@supabase/ssr";
import { AuthSessionMissingError, isAuthApiError } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { routing } from "@/i18n/routing";
import { isRetryableAuthError, timeoutFetch } from "@/lib/with-timeout";

const MIDDLEWARE_FETCH_TIMEOUT_MS = 5_000;

function getSafeNextPath(request: NextRequest) {
  const redirectTo = request.nextUrl.pathname + request.nextUrl.search;
  if (!redirectTo.startsWith("/") || redirectTo.startsWith("//")) {
    return "/dashboard";
  }
  return redirectTo;
}

function redirectToLogin(
  request: NextRequest,
  sessionResponse: NextResponse,
) {
  const url = request.nextUrl.clone();
  const requestedLocale = routing.locales.find(
    (locale) =>
      request.nextUrl.pathname === `/${locale}` ||
      request.nextUrl.pathname.startsWith(`/${locale}/`),
  );
  // Keep non-default locale prefixes on the auth redirect. Redirecting an
  // English/Russian protected route to the unprefixed default-locale URL can
  // make next-intl canonicalize back to itself during an RSC prefetch.
  url.pathname =
    requestedLocale && requestedLocale !== routing.defaultLocale
      ? `/${requestedLocale}/auth/login`
      : "/auth/login";
  url.searchParams.set("next", getSafeNextPath(request));

  // A confirmed signed-out result can arrive after Supabase refreshed or
  // cleared cookies. Preserve those mutations on the redirect so the browser
  // does not retain stale session state.
  const response = NextResponse.redirect(url);
  sessionResponse.cookies.getAll().forEach((cookie) => {
    response.cookies.set(cookie);
  });
  return response;
}

// A refresh-token rotation has exactly one winner. When the browser client's
// own 30s auto-refresh tick and this middleware's reactive refresh race inside
// the 90s expiry margin, the loser gets a 400 with one of these codes — which is
// byte-identical to a real sign-out at this layer, but is NOT one. Booting on it
// is the false logout the tester reported ("I am logged in, I click a category
// to post a listing, and it throws me back to Log In").
const ROTATION_LOSER_CODES = new Set([
  "refresh_token_not_found",
  "refresh_token_already_used",
]);

function isTransientAuthFailure(error: unknown): boolean {
  // Fetch-level failure, our own timeout abort, or any 5xx (incl. the plain
  // GoTrue 500 that isAuthRetryableFetchError misses).
  if (isRetryableAuthError(error)) return true;
  return (
    isAuthApiError(error) &&
    error.status === 400 &&
    typeof error.code === "string" &&
    ROTATION_LOSER_CODES.has(error.code)
  );
}

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  // Snapshot the incoming jar BEFORE the client can touch it: `setAll` mutates
  // `request.cookies` in place and rebuilds `supabaseResponse`, so by the time a
  // failure surfaces, both carry auth-js's maxAge:0 deletion cookies and the
  // original values are gone. Letting a transient failure "through" while still
  // returning that poisoned response would delete the session anyway — the same
  // logout, one request later.
  const originalCookies = request.cookies.getAll();
  let sessionMutated = false;

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: { fetch: timeoutFetch(MIDDLEWARE_FETCH_TIMEOUT_MS) },
      cookieOptions: {
        path: "/",
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
      },
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          sessionMutated = true;
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const normalizedPath = routing.locales.reduce(
    (path, locale) =>
      path.startsWith(`/${locale}/`) || path === `/${locale}`
        ? path.replace(`/${locale}`, "") || "/"
        : path,
    request.nextUrl.pathname,
  );

  const isProtected =
    normalizedPath.startsWith("/create") ||
    normalizedPath.startsWith("/dashboard");

  try {
    // Verify the session by checking the JWT signature LOCALLY against the
    // project's published JWKS (ES256). Unlike getUser(), getClaims() makes no
    // network round-trip to the Auth server in the common (valid-token) case —
    // it reads the cookie and verifies the signature offline. This matters here
    // because on the Hobby plan middleware runs at the edge (not the pinned
    // function region), so a getUser() call would cross regions to the Tokyo
    // Auth server on every protected-route request. An expired token is still
    // refreshed on-demand (getClaims -> getSession -> refresh) and the rotated
    // cookies are written to supabaseResponse, so sessions don't silently drop.
    const { data, error } = await supabase.auth.getClaims();

    if (!data?.claims && isProtected) {
      // getClaims() resolves to { data: null, error } on a transient network
      // failure (only possible when an expired token needs a refresh round-trip)
      // — it does NOT throw. Booting the user then is a false logout. Only
      // redirect on a confirmed signed-out state; let transient failures through
      // so page guards (and the client) re-validate.
      if (error instanceof AuthSessionMissingError || !error) {
        // Confirmed signed out: no session in the jar at all. Stay strict —
        // /create/* and /dashboard/* have no other server gate for anonymous
        // visitors (C8).
        return redirectToLogin(request, supabaseResponse);
      }
      if (isTransientAuthFailure(error)) {
        console.warn(
          "[middleware] transient auth check, letting request through:",
          error.message,
        );
        // Restore the caller's own cookies so the browser KEEPS its session and
        // simply retries on the next request. Returning `supabaseResponse` here
        // would hand back the deletion cookies and undo this entirely.
        if (sessionMutated) {
          originalCookies.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          return NextResponse.next({ request });
        }
      } else {
        return redirectToLogin(request, supabaseResponse);
      }
    }
  } catch (err) {
    // A genuine throw (e.g. lock-acquire timeout) is also transient — never boot.
    // The browser client still has a valid session; let the request through and let
    // client-side guards re-validate. Only confirmed "user === null" gates protected routes.
    console.error("[middleware] supabase.auth.getUser threw:", err);
  }

  return supabaseResponse;
}
