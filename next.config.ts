import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import withBundleAnalyzerInit from "@next/bundle-analyzer";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

// Run `ANALYZE=true npm run build` to emit the interactive bundle report.
const withBundleAnalyzer = withBundleAnalyzerInit({
  enabled: process.env.ANALYZE === "true",
});

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // The media-finalize route reads public/watermark.png at runtime via fs;
  // Vercel's serverless bundler doesn't trace public/ automatically, so include
  // it explicitly or the read 404s in production.
  outputFileTracingIncludes: {
    "/api/media/intents/[id]/finalize": ["./public/watermark.png"],
  },
  async headers() {
    // Applies to API and static responses. Navigable page responses receive the
    // stricter CSP emitted by middleware.
    const baseline = [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
      { key: "Cross-Origin-Resource-Policy", value: "same-site" },
      {
        key: "Permissions-Policy",
        value: "camera=(), microphone=(), geolocation=(self)",
      },
      ...(process.env.NODE_ENV === "production"
        ? [
            {
              key: "Strict-Transport-Security",
              value: "max-age=63072000; includeSubDomains; preload",
            },
          ]
        : []),
    ];
    return [
      {
        source: "/:path*",
        headers: baseline,
      },
    ];
  },
  images: {
    formats: ["image/avif", "image/webp"],
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
    ],
  },
  experimental: {
    optimizePackageImports: ["lucide-react", "date-fns", "framer-motion"],
    // Client Router Cache lifetimes. Next 15 defaults to `dynamic: 0`, which
    // makes every force-dynamic entry (the 8 [id] detail pages and all of
    // /dashboard/**) non-reusable, so browser Back/Forward refetched the whole
    // RSC payload from the origin — ~340ms of Singapore round trip per press.
    // Raising it to 30s serves those from memory instead. Verified in a
    // DevTools trace: Back now issues zero RSC requests.
    //
    // What this does NOT fix, measured rather than assumed: a *forward* click
    // into a force-dynamic route still refetches even when its prefetch has
    // fully completed — Next will not reuse a prefetched dynamic segment for a
    // forward navigation. Only converting those routes off force-dynamic would
    // change that (see the plan's Out of scope).
    //
    // 30s is tighter than the 60s the data layer already serves from
    // (PUBLIC_LISTING_REVALIDATE_S), and router.refresh() / revalidateTag still
    // bypass this cache, so nothing needing immediacy changes. `static` is left
    // at Next's own default of 300 — lowering it would be a regression.
    staleTimes: { dynamic: 30, static: 300 },
  },
};

export default withBundleAnalyzer(withNextIntl(nextConfig));
