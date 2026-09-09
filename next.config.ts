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
    // WebP only, deliberately no AVIF: the optimizer runs on this app's own
    // small DO instance (not a managed edge optimizer), and AVIF encodes are
    // roughly an order of magnitude slower than WebP for a marginal byte win
    // at card/gallery sizes. With AVIF listed first, every cold
    // photo/width/format transform paid that cost (~1.1-2.3s measured).
    formats: ["image/webp"],
    // Default deviceSizes go up to 3840; nothing on the site renders an image
    // wider than the 1160px content column at DPR 2, so the 2048/3840 rungs
    // only added cold-transform surface. Trim the ladder at 1920.
    deviceSizes: [640, 750, 828, 1080, 1200, 1920],
    // Next's optimizer sets its response Cache-Control to
    // max(minimumCacheTTL, upstream max-age). Supabase Storage uploads default
    // to a 1h cacheControl (only one upload route out of eight overrides it),
    // so without this floor every distinct photo/width/format combination goes
    // cold again every hour. Measured on prod: a cold /_next/image transform
    // takes ~1.1-2.3s on the single-vCPU origin, which is what "images load
    // slowly" actually was. Uploaded photos are immutable (random UUID
    // filenames, never overwritten - see PhotoUploader.tsx upsert:false), so a
    // 1-year floor is safe.
    minimumCacheTTL: 31536000,
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
    // forward navigation. RESOLVED for the 8 public [id] detail routes on
    // 2026-09-09: they are ISR now (cookie-free, revalidate 60 — owner/admin
    // preview moved to /preview/*), so `static: 300` applies to them and a
    // completed prefetch IS reused on forward navigation. /dashboard/** stays
    // force-dynamic and keeps paying the dynamic:30 behavior described above.
    //
    // 30s is tighter than the 60s the data layer already serves from
    // (PUBLIC_LISTING_REVALIDATE_S), and router.refresh() / revalidateTag still
    // bypass this cache, so nothing needing immediacy changes. `static` is left
    // at Next's own default of 300 — lowering it would be a regression.
    staleTimes: { dynamic: 30, static: 300 },
  },
};

export default withBundleAnalyzer(withNextIntl(nextConfig));
