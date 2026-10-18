// Same-origin image URLs for the sitemap and structured data (C40). Pure and
// self-contained (no `@/`, no sibling imports) so scripts/unit can test it (C29).
//
// A raw Supabase Storage URL lives on a domain we cannot verify in Search
// Console, which image sitemaps want. The optimizer URL is on our own origin, is
// what the page's own <img srcset> serves and what the CDN caches.
//
// `/_next/image` only serves widths in next.config.ts `images.deviceSizes` and
// qualities in `images.qualities`; anything else is a 400. check-contracts (C40)
// keeps both lists containing these values.
export const SEO_IMAGE_WIDTH = 1200;
export const SEO_IMAGE_QUALITY = 75;
export const SEO_MAX_IMAGES = 3;

/**
 * Optimizer URLs for the first `max` https photos. Local placeholders and
 * non-https references carry no listing content (or cannot be fetched), so they
 * are skipped. The result is plain text: XML contexts escape it themselves.
 */
export function optimizedImageUrls(
  siteUrl: string,
  photos: readonly (string | null | undefined)[],
  max: number = SEO_MAX_IMAGES,
): string[] {
  const out: string[] = [];
  for (const src of photos) {
    if (typeof src !== "string" || !/^https:\/\//i.test(src)) continue;
    const url = new URL("/_next/image", siteUrl);
    url.searchParams.set("url", src);
    url.searchParams.set("w", String(SEO_IMAGE_WIDTH));
    url.searchParams.set("q", String(SEO_IMAGE_QUALITY));
    out.push(url.href);
    if (out.length === max) break;
  }
  return out;
}
