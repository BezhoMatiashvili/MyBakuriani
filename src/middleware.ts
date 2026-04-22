import createIntlMiddleware from "next-intl/middleware";
import { type NextRequest } from "next/server";
import { routing } from "./i18n/routing";
import { updateSession } from "@/lib/supabase/middleware";

const intlMiddleware = createIntlMiddleware(routing);

export async function middleware(request: NextRequest) {
  // Run next-intl middleware first to handle locale routing
  const intlResponse = intlMiddleware(request);

  // For protected routes, also run Supabase session check
  const pathname = request.nextUrl.pathname;

  // Strip locale prefix to check the actual route
  const pathnameWithoutLocale = routing.locales.reduce(
    (path, locale) =>
      path.startsWith(`/${locale}/`) || path === `/${locale}`
        ? path.replace(`/${locale}`, "") || "/"
        : path,
    pathname,
  );

  const isProtected = pathnameWithoutLocale.startsWith("/create");

  if (isProtected) {
    // Run Supabase auth check — updateSession returns a response with session cookies
    const sessionResponse = await updateSession(request);

    // If updateSession redirected (e.g., to login), follow that redirect
    if (sessionResponse.headers.get("location")) {
      return sessionResponse;
    }

    // Otherwise, merge session cookies into the intl response
    sessionResponse.cookies.getAll().forEach((cookie) => {
      intlResponse.cookies.set(cookie.name, cookie.value);
    });
  }

  return intlResponse;
}

export const config = {
  matcher: "/((?!api|trpc|_next|_vercel|.*\\..*).*)",
};
