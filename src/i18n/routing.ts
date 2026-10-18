import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  locales: ["ka", "en", "ru"],
  defaultLocale: "ka",
  localePrefix: "as-needed",
  localeDetection: false,
  // Cloudflare refuses to cache any response carrying Set-Cookie, and next-intl
  // emits NEXT_LOCALE on every document response. That single header was the only
  // difference between `/` (cf-cache-status: HIT, ~25ms) and `/apartments`
  // (BYPASS, ~340ms to the Singapore origin) — measured on prod.
  //
  // The cookie is inert here: localeDetection is false, so next-intl never reads
  // it back, and nothing in src/ references NEXT_LOCALE. Locale is carried purely
  // by the URL (localePrefix "as-needed"); LanguageSelector switches via
  // router.replace(pathname, { locale }), which changes the URL, not the cookie.
  // This also no-ops syncLocaleCookie in the navigation helpers — harmless for the
  // same reason.
  localeCookie: false,
  // hreflang is declared once, in each page's <head> and in the sitemap, from the
  // same function (src/lib/seo/alternates.ts). next-intl's own HTTP `Link` header
  // would be a second source that could disagree with them (C40).
  alternateLinks: false,
});

export type AppLocale = (typeof routing.locales)[number];
