import type { MetadataRoute } from "next";
import { routing } from "@/i18n/routing";
import { buildRobotsConfig } from "@/lib/seo/robots";
import { IS_INDEXABLE, SITE_URL } from "@/lib/seo/site";

// Root-level (outside `[locale]`) so Next.js resolves /robots.txt here
// directly instead of falling through to the `[locale]` catch-all, which
// would treat "robots.txt" as an (invalid) locale segment and force
// next-intl's requestLocale to fall back to reading headers() — flipping this
// route from static to dynamic at runtime. On a persistent Node server (not
// Vercel's per-request isolation) that throws and crashes the whole process.
// The rules (per-locale disallows, the /api/og/ allow, noindex hosts staying
// crawlable) live in src/lib/seo/robots.ts so they can be unit tested (C40).
export default function robots(): MetadataRoute.Robots {
  return buildRobotsConfig({
    locales: routing.locales,
    defaultLocale: routing.defaultLocale,
    indexable: IS_INDEXABLE,
    siteUrl: SITE_URL,
  });
}
