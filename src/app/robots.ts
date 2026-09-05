import type { MetadataRoute } from "next";

// Root-level (outside `[locale]`) so Next.js resolves /robots.txt here
// directly instead of falling through to the `[locale]` catch-all, which
// would treat "robots.txt" as an (invalid) locale segment and force
// next-intl's requestLocale to fall back to reading headers() — flipping this
// route from static to dynamic at runtime. On a persistent Node server (not
// Vercel's per-request isolation) that throws and crashes the whole process.
const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://my-bakuriani.vercel.app";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/api/",
        "/dashboard/",
        "/create/",
        "/auth/",
        "/checkout",
        "/notifications",
        "/sms-consent/",
      ],
    },
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}
