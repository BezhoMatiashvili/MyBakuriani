import { createServerClient } from "@supabase/ssr";
import { isAuthRetryableFetchError } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { routing } from "@/i18n/routing";
import { timeoutFetch } from "@/lib/with-timeout";

const MIDDLEWARE_FETCH_TIMEOUT_MS = 5_000;

function getSafeNextPath(request: NextRequest) {
  const redirectTo = request.nextUrl.pathname + request.nextUrl.search;
  if (!redirectTo.startsWith("/") || redirectTo.startsWith("//")) {
    return "/dashboard";
  }
  return redirectTo;
}

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

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
      if (isAuthRetryableFetchError(error)) {
        console.warn(
          "[middleware] transient auth check, letting request through:",
          error.message,
        );
      } else {
        const url = request.nextUrl.clone();
        url.pathname = "/auth/login";
        url.searchParams.set("next", getSafeNextPath(request));
        return NextResponse.redirect(url);
      }
    }

    if (normalizedPath.startsWith("/dashboard/admin")) {
      const aal = data?.claims?.aal;
      if (aal !== "aal2") {
        const url = request.nextUrl.clone();
        url.pathname = "/auth/login";
        url.searchParams.set("mfa", "required");
        return NextResponse.redirect(url);
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
