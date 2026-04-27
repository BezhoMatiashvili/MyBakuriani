import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { routing } from "@/i18n/routing";

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

  const isProtected = normalizedPath.startsWith("/create");

  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user && isProtected) {
      const url = request.nextUrl.clone();
      url.pathname = "/auth/login";
      url.searchParams.set("next", getSafeNextPath(request));
      return NextResponse.redirect(url);
    }
  } catch (err) {
    // A transient network/fetch error from Edge → Supabase must NOT log the user out.
    // The browser client still has a valid session; let the request through and let
    // client-side guards re-validate. Only confirmed "user === null" gates protected routes.
    console.error("[middleware] supabase.auth.getUser threw:", err);
  }

  return supabaseResponse;
}
