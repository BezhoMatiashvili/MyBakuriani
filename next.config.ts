import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import withBundleAnalyzerInit from "@next/bundle-analyzer";
import { SUPABASE_MEDIA_HOSTS } from "./src/lib/media-hosts";

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
    // Edge-cache the public listing detail pages (and blog posts) (C28).
    // Verified quirk (matches prod /blog behavior): an on-demand-ISR route
    // reached through the locale REWRITE (unprefixed URL → /ka/...) renders
    // dynamically with `no-store` and never populates the ISR cache — only
    // prefixed /en/... /ru/... requests do. Since these routes are cookie-free
    // by contract (see the detail pages' ISR comments), the HTML is identical
    // for every viewer, so overriding Cache-Control here is safe and lets
    // Cloudflare serve the dominant unprefixed traffic from the edge. Any
    // ?preview request keeps its own cache key and is left alone (middleware
    // pins the signed-in preview rewrite as uncacheable). Mirrors the pages'
    // revalidate = 60; kinds and locales mirror PREVIEW_DETAIL_RE in
    // src/middleware.ts and routing.locales. This was set by middleware until
    // 2026-09-26 — moved here because a middleware header always beats a
    // next.config one, so the RSC rule below could not win on these routes.
    const edgeCached = {
      missing: [{ type: "query", key: "preview" }],
      headers: [
        {
          key: "Cache-Control",
          value: "s-maxage=60, stale-while-revalidate=300",
        },
      ],
    };
    return [
      {
        source: "/:path*",
        headers: baseline,
      },
      {
        source:
          "/:locale(ka|en|ru)?/:kind(apartments|hotels|sales|food|services|entertainment|transport|employment)/:id([^/.]+)",
        ...edgeCached,
      },
      {
        source: "/:locale(ka|en|ru)?/blog/:slug([^/.]+)",
        ...edgeCached,
      },
      // An RSC request without the `_rsc` cache-busting param never comes from
      // a real Next client (fetch-server-response always appends it). The CDN
      // keys on the URL and ignores Vary, so with a public Cache-Control its
      // Flight payload would replace the page's HTML at the edge. Keep this
      // rule LAST so it overrides the ones above. It cannot live in middleware:
      // Next strips the RSC header and `_rsc` from the request middleware sees.
      {
        source: "/:path*",
        has: [{ type: "header", key: "rsc" }],
        missing: [{ type: "query", key: "_rsc" }],
        headers: [{ key: "Cache-Control", value: "private, no-store" }],
      },
    ];
  },
  // Metadata (og:* tags) always in <head>, for every user agent. By default
  // Next streams it into <body> for browsers and blocks it into <head> only
  // for known bots — but the 8 detail pages are edge-cached (C28) and
  // Cloudflare does not vary on User-Agent, so a browser's visit decided what
  // WhatsApp was served: the og:* tags ~93 KB into <body> instead of <head>
  // (measured on staging 2026-09-25). Only the metadata placement changes;
  // browsers still get streamed Suspense, which keys off Next's own bot list.
  htmlLimitedBots: /.*/,
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
    // No <Image> in src/ passes a `quality` prop, so every legit request uses
    // Next's default q=75. Any other q is a 400 instead of a fresh transform.
    qualities: [75],
    remotePatterns: [
      // Only our own Supabase projects, never any *.supabase.co host — the
      // same list the middleware CSP allows (C6, src/lib/media-hosts.ts).
      ...SUPABASE_MEDIA_HOSTS.map((hostname) => ({
        protocol: "https" as const,
        hostname,
        pathname: "/storage/v1/object/public/**",
      })),
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
    // Middleware runs on /api/*, so Next clones every request body for it and
    // cuts the clone AND the body the route handler receives at this size
    // (default exactly 10 MiB, with only a console warning). A job
    // application may carry a 10 MiB CV plus multipart overhead
    // (/api/job-applications allows up to 10 MiB + 256 KiB), so leave room.
    middlewareClientMaxBodySize: "11mb",
    // Refuse to decode optimizer inputs above ~50 MP (Next's default is
    // ~268 MP). Owner uploads are downscaled to <=2560px client-side and admin
    // landing media is camera-sized (<=~45 MP); a larger source is served as
    // the original instead of being decoded on the single-vCPU origin.
    imgOptMaxInputPixels: 50_000_000,
  },
};

export default withBundleAnalyzer(withNextIntl(nextConfig));
