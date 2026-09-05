import type { MetadataRoute } from "next";
import { routing } from "@/i18n/routing";

// Root-level for the same reason as `robots.ts` next to it: without an
// explicit route here, /sitemap.xml falls through to the `[locale]`
// catch-all and crashes the same way (static-to-dynamic error from
// next-intl's requestLocale reading headers()).
const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://my-bakuriani.vercel.app";

const PUBLIC_PATHS = [
  "",
  "/apartments",
  "/hotels",
  "/sales",
  "/food",
  "/services",
  "/entertainment",
  "/transport",
  "/employment",
  "/blog",
  "/faq",
  "/contact",
  "/terms",
  "/privacy",
  "/search",
];

function localizedPath(locale: string, path: string) {
  // localePrefix: "as-needed" — the default locale ("ka") is unprefixed.
  return locale === routing.defaultLocale ? path || "/" : `/${locale}${path}`;
}

export default function sitemap(): MetadataRoute.Sitemap {
  return routing.locales.flatMap((locale) =>
    PUBLIC_PATHS.map((path) => ({
      url: `${siteUrl}${localizedPath(locale, path)}`,
      lastModified: new Date(),
    })),
  );
}
