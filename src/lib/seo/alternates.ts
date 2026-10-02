// canonical + hreflang paths for a public page (C40). Pure and self-contained
// (no `@/`, no sibling imports) so scripts/unit can test it (C29).
//
// The default locale (ka) has NO prefix under next-intl's
// `localePrefix: "as-needed"`; every other locale does. The HTML alternates, the
// sitemap's <xhtml:link> entries and (while it is on) next-intl's `Link` header
// must name byte-identical URLs, so all three come from this one function.

/**
 * Path of `path` in `locale`. "/" maps to "/", "/en", "/ru": next-intl serves
 * the prefixed home WITHOUT a trailing slash (`/en/` is a 308 away).
 */
export function pathForLocale(
  path: string,
  locale: string,
  defaultLocale: string,
): string {
  const rest = path === "" || path === "/" ? "" : path;
  const normalized = rest && !rest.startsWith("/") ? `/${rest}` : rest;
  return locale === defaultLocale
    ? normalized || "/"
    : `/${locale}${normalized}`;
}

export interface AlternatesInput {
  /** Locale-less path: "/", "/apartments", "/apartments/<uuid>". */
  path: string;
  /** Locale of the page being rendered. */
  locale: string;
  locales: readonly string[];
  defaultLocale: string;
}

export interface Alternates {
  /** Self-referencing canonical, relative: metadataBase makes it absolute. */
  canonical: string;
  /** One entry per locale plus "x-default" (= the unprefixed default locale). */
  languages: Record<string, string>;
}

export function buildAlternates(input: AlternatesInput): Alternates {
  const { path, locale, locales, defaultLocale } = input;
  const languages: Record<string, string> = {};
  for (const l of locales) {
    languages[l] = pathForLocale(path, l, defaultLocale);
  }
  languages["x-default"] = pathForLocale(path, defaultLocale, defaultLocale);
  return {
    canonical: pathForLocale(path, locale, defaultLocale),
    languages,
  };
}
