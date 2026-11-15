const SUPPORTED_LOCALE_PREFIX = /^\/(ka|en|ru)(?=\/|$)/;

// Public pages only, none of which carries a token or an id of a person in its
// path. The admin analytics page types (C49, analytics_page_type) cover them.
const PUBLIC_ROUTE_ROOTS = new Set([
  "/apartments",
  "/appartments",
  "/bakuriani",
  "/blog",
  "/contact",
  "/employment",
  "/entertainment",
  "/faq",
  "/food",
  "/hotels",
  "/live-cameras",
  "/marketing-policy",
  "/pricing",
  "/privacy",
  "/road-status",
  "/sales",
  "/search",
  "/services",
  "/terms",
  "/transport",
  "/weather-and-lifts",
]);

/** Returns a locale-free, query-free public pathname or null when untrackable. */
export function normalizePublicPageviewPath(
  value: string | null | undefined,
): string | null {
  if (typeof value !== "string" || value.length === 0 || value.length > 512) {
    return null;
  }
  if (
    !value.startsWith("/") ||
    value.includes("?") ||
    value.includes("#") ||
    value.includes("\\") ||
    value.includes("//") ||
    Array.from(value).some((char) => char.charCodeAt(0) < 32)
  ) {
    return null;
  }

  const withoutLocale = value.replace(SUPPORTED_LOCALE_PREFIX, "") || "/";
  const normalized =
    withoutLocale.length > 1 ? withoutLocale.replace(/\/+$/, "") : "/";
  const segments = normalized.split("/");
  if (segments.some((segment) => segment === "." || segment === "..")) {
    return null;
  }
  if (normalized === "/") return normalized;

  const root = `/${segments[1] ?? ""}`;
  return PUBLIC_ROUTE_ROOTS.has(root) ? normalized : null;
}

// TOP.GE rating counter (components/analytics/TopGeCounter.tsx). The visit is
// reported by the badge image's own request. It is built here like TOP.GE's
// counter.js builds it (the same eight parameters, in the same order and
// encoding), but the page can only be a public one and the referrer never
// carries a query, a fragment or a private page of this site.

export const TOP_GE_BADGE_HREF = "https://www.top.ge/index.php?h=119119#119119";

const TOP_GE_HIT_URL = "https://counter.top.ge/cgi-bin/count222?";
const TOP_GE_MAX_LENGTH = 1000;

function topGeReferrer(referrer: string, origin: string): string {
  let url: URL;
  try {
    url = new URL(referrer);
  } catch {
    return "";
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return "";
  if (
    url.origin === origin &&
    normalizePublicPageviewPath(url.pathname) === null
  ) {
    return `${origin}/`;
  }
  return `${url.origin}${url.pathname}`.slice(0, TOP_GE_MAX_LENGTH);
}

export type TopGeHitInput = {
  /** `window.location.origin` and `.pathname` of the page being viewed. */
  origin: string;
  pathname: string;
  /** The previous reported page, else `document.referrer`. */
  referrer: string;
  /** `1e4 * Math.random()`, as the vendor's counter sends it. */
  rand: number;
  width: number;
  height: number;
  depth: number;
};

/**
 * The hit's image URL and the page address it reports, or null when the page
 * is not a public one (so nothing may be sent).
 */
export function buildTopGeHit(
  input: TopGeHitInput,
): { url: string; page: string } | null {
  if (normalizePublicPageviewPath(input.pathname) === null) return null;
  const page = `${input.origin}${input.pathname}`;
  const fields: Array<[string, string | number]> = [
    ["ID", 119119],
    ["JS", 11],
    ["RAND", input.rand],
    // The site is never framed (frame-ancestors 'none').
    ["ISFRM", 0],
    ["REFERER", topGeReferrer(input.referrer, input.origin)],
    ["RESOLUTION", `${input.width}x${input.height}`],
    ["JL", page],
    ["DEPT", input.depth],
  ];
  const query = fields
    .map(([key, value]) => `${key}:${encodeURIComponent(value)}`)
    .join("+");
  return { url: TOP_GE_HIT_URL + query, page };
}
