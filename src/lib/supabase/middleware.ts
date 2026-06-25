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
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

    if (!user && isProtected) {
      // getUser() resolves to { user: null, error } on a transient network/timeout
      // failure (AuthRetryableFetchError) — it does NOT throw. Booting the user in
      // that case is a false logout. Only redirect on a confirmed signed-out state;
      // let transient failures through so page guards (and the client) re-validate.
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
  } catch (err) {
    // A genuine throw (e.g. lock-acquire timeout) is also transient — never boot.
    // The browser client still has a valid session; let the request through and let
    // client-side guards re-validate. Only confirmed "user === null" gates protected routes.
    console.error("[middleware] supabase.auth.getUser threw:", err);
  }

  return supabaseResponse;
}
