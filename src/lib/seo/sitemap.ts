// Sitemap assembly (C40). Pure and self-contained (no `@/`, no sibling imports)
// so scripts/unit can test it (C29).
//
// The locale/URL rules are injected, not re-implemented: the caller hands in the
// same `buildAlternates` the pages' <head> uses, so a sitemap <loc> and
// <xhtml:link> can never name a different URL than the page's own canonical and
// hreflang tags.

/** Listings that exist only to test the platform; never submitted to a search engine. */
export const SEED_LISTING_ID_PREFIXES = ["facade00-", "aae2ff00-"] as const;

export function isSeedListingId(id: string): boolean {
  return SEED_LISTING_ID_PREFIXES.some((prefix) => id.startsWith(prefix));
}

/** (locale-less path, locale) -> that locale's canonical path and every alternate. */
export type AlternatesFor = (
  path: string,
  locale: string,
) => { canonical: string; languages: Record<string, string> };

export interface SitemapPage {
  /** Locale-less path: "/", "/apartments", "/apartments/<uuid>". */
  path: string;
  /**
   * Only a true content-change time. Never a listing's `updated_at`: the view
   * counter UPDATEs that column on every page view, and a lastmod that always
   * changes teaches Google to ignore the field.
   */
  lastModified?: Date | null;
  /** Absolute image URLs, plain text (see image-url.ts); escaped on the way out. */
  images?: string[];
}

export interface SitemapEntry {
  url: string;
  lastModified?: Date;
  alternates: { languages: Record<string, string> };
  images?: string[];
}

/**
 * Next 15 writes <loc>, hreflang hrefs and <image:loc> into the XML verbatim
 * (resolve-route-data.js), so a raw `&` makes the whole file invalid and Google
 * rejects it. e2e/public/seo.spec.ts fails if a Next upgrade starts escaping too
 * (a double-escaped `&amp;amp;`).
 */
export function xmlEscape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// `new URL` percent-encodes a Georgian blog slug exactly as Next does when it
// resolves a page's canonical against metadataBase, so both sides print the
// same bytes.
function absolute(siteUrl: string, path: string): string {
  return xmlEscape(new URL(path, siteUrl).href);
}

/** One entry per page per locale, each carrying the page's full hreflang set. */
export function buildSitemapEntries(input: {
  siteUrl: string;
  locales: readonly string[];
  alternatesFor: AlternatesFor;
  pages: readonly SitemapPage[];
}): SitemapEntry[] {
  const { siteUrl, locales, alternatesFor, pages } = input;
  const entries: SitemapEntry[] = [];
  for (const page of pages) {
    for (const locale of locales) {
      const { canonical, languages } = alternatesFor(page.path, locale);
      const entry: SitemapEntry = {
        url: absolute(siteUrl, canonical),
        alternates: {
          languages: Object.fromEntries(
            Object.entries(languages).map(([lang, path]) => [
              lang,
              absolute(siteUrl, path),
            ]),
          ),
        },
      };
      if (page.lastModified) entry.lastModified = page.lastModified;
      if (page.images?.length) entry.images = page.images.map(xmlEscape);
      entries.push(entry);
    }
  }
  return entries;
}
