// robots.txt rules (C40). Pure and self-contained so scripts/unit can test it
// (C29); src/app/robots.ts is a thin wrapper.

/**
 * Locale-less path prefixes that must never be crawled or indexed: the auth
 * gated cabinets, token-carrying pages and the owner preview twins. Written
 * WITHOUT a trailing slash so `/create` is covered as well as `/create/…`.
 * check-contracts.mjs (C40) pins this list against middleware's protected
 * prefixes.
 */
export const NON_INDEXABLE_PREFIXES = [
  "/dashboard",
  "/create",
  "/auth",
  "/notifications",
  "/sms-consent",
  "/preview",
  "/review",
] as const;

export interface RobotsConfig {
  rules: { userAgent: string; allow: string[]; disallow?: string[] };
  sitemap?: string;
}

export function buildRobotsConfig(input: {
  locales: readonly string[];
  defaultLocale: string;
  /** From isIndexableSiteUrl(): true only on the canonical host. */
  indexable: boolean;
  siteUrl: string;
}): RobotsConfig {
  if (!input.indexable) {
    // Crawlable on purpose. Every response on a non-canonical host carries
    // `X-Robots-Tag: noindex, nofollow` (middleware) plus a robots meta, and a
    // `Disallow: /` here would hide that from Google and leave any URL it has
    // already discovered stuck in the index. No Sitemap line either.
    return { rules: { userAgent: "*", allow: ["/"] } };
  }

  // The prefixes are locale-less but the site is not: /en/dashboard and
  // /ru/auth/login are real URLs, so every non-default locale gets its own line.
  const disallow: string[] = ["/api/"];
  for (const prefix of NON_INDEXABLE_PREFIXES) {
    for (const locale of input.locales) {
      disallow.push(
        locale === input.defaultLocale ? prefix : `/${locale}${prefix}`,
      );
    }
  }

  return {
    // "/api/og/" must stay allowed: it sits under the "/api/" disallow, and
    // facebookexternalhit honours robots.txt for the og:image fetch. The longest
    // match wins for both Google and Facebook.
    rules: { userAgent: "*", allow: ["/", "/api/og/"], disallow },
    sitemap: `${input.siteUrl}/sitemap.xml`,
  };
}
