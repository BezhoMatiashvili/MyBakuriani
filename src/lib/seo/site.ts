// Which origin is this build, and may search engines index it? (C40)
//
// Pure and alias-free on purpose: scripts/unit/*.test.mjs import it directly
// under `node --test` type-stripping (C29), so it must not use `@/` or import
// siblings.

/**
 * The only host search engines may index. scripts/check-production-config.mjs
 * and scripts/check-redirects.mjs echo this value; check-contracts.mjs (C40)
 * fails when they drift.
 */
export const CANONICAL_HOST = "mybakuriani.ge";

/**
 * What robots.ts, sitemap.ts and the root layout fell back to before this
 * module existed. It is deliberately NOT the canonical host, so a build with an
 * unset NEXT_PUBLIC_SITE_URL is never indexable.
 */
export const DEFAULT_SITE_URL = "https://my-bakuriani.vercel.app";

/** The brand as search engines should show it (Organization/WebSite markup). */
export const SITE_NAME = "MyBakuriani";
export const SITE_ALTERNATE_NAMES = ["MyBakuriani.ge", "My Bakuriani"] as const;
/** Square brand mark, crawlable, >= 112 px: the Organization logo. */
export const SITE_LOGO_PATH = "/android-chrome-512x512.png";

/** The site origin without a trailing slash. */
export function resolveSiteUrl(raw: string | null | undefined): string {
  const value = raw?.trim();
  return (value || DEFAULT_SITE_URL).replace(/\/+$/, "");
}

/**
 * Fail-safe direction: only the canonical host is indexable. Local builds,
 * staging, preview URLs and a mistyped env var all come out noindex, so the
 * worst misconfiguration hides a site instead of duplicating it in Google.
 */
export function isIndexableSiteUrl(siteUrl: string): boolean {
  try {
    return new URL(siteUrl).hostname === CANONICAL_HOST;
  } catch {
    return false;
  }
}

/**
 * SITE_LOCKED (C27) is the owner's launch gate: while it is on, every page
 * answers a redirect to /site-locked. It is a server-only variable, so callers
 * read it where they need it (the sitemap's hourly rebuild sees the running
 * server's value). Same test as the middleware's: exactly "true".
 */
export function isSiteLocked(raw: string | undefined): boolean {
  return raw === "true";
}

/** NEXT_PUBLIC_* is inlined at build time (middleware included). */
export const SITE_URL = resolveSiteUrl(process.env.NEXT_PUBLIC_SITE_URL);

export const IS_INDEXABLE = isIndexableSiteUrl(SITE_URL);

/** Absolute URL on this deployment's origin for a locale-prefixed path. */
export function absoluteUrl(path: string): string {
  return `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}
