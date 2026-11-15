// Meta Pixel (C59): the pure rules, kept free of runtime imports so
// scripts/unit/meta-core.test.mjs can load this file bare (C29).
//
// fbevents.js sends the page's own address (dl = location.href) and
// document.referrer (rl) with every hit, so a hit is allowed only when both are
// safe: no token page, no fragment, and every query key on an allow-list. A
// call on an unsafe URL is skipped, never rewritten.

/** The only events the site sends, and the fbq method each one uses. */
export const META_EVENTS = {
  PageView: "track",
  CompleteRegistration: "track",
  Lead: "track",
  SmartMatchRequest: "trackCustom",
} as const;

export type MetaEventName = keyof typeof META_EVENTS;

export function isMetaEventName(value: unknown): value is MetaEventName {
  return (
    typeof value === "string" &&
    Object.prototype.hasOwnProperty.call(META_EVENTS, value)
  );
}

/** Pages whose address carries a personal code or a preview (locale stripped). */
export const META_TOKEN_ROOTS = [
  "/auth/confirm",
  "/auth/reset-password",
  "/auth/callback",
  "/sms-consent",
  "/sms-stop",
  "/review",
  "/join",
  "/l",
  "/preview",
] as const;

// Same locales as src/i18n/routing.ts (C2; check-contracts C59 compares them).
const META_LOCALE_PREFIX = /^\/(ka|en|ru)(?=\/|$)/;

const MAX_HREF_LENGTH = 2048;
const CLICK_ID_KEYS = new Set([
  "fbclid",
  "gclid",
  "gbraid",
  "wbraid",
  "msclkid",
  "ttclid",
  "igshid",
  "brid",
]);
const CLICK_ID_VALUE = /^[A-Za-z0-9._~-]{1,300}$/;
const UTM_KEY = /^utm_[a-z0-9_]{1,40}$/;

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const COUNT = /^\d{1,3}$/;
const AMOUNT = /^\d{1,7}(\.\d{1,2})?$/;

// Listing filters, read from the pages' own search-param parsers. Free text
// (q, location, zone, cadastral) is never on the list.
const PAGE_KEYS: Record<string, Record<string, RegExp>> = {
  "/search": {
    mode: /^(rent|sale)$/,
    check_in: DATE,
    check_out: DATE,
    guests: COUNT,
    rooms: COUNT,
    bathrooms: COUNT,
    price_min: AMOUNT,
    price_max: AMOUNT,
    area_min: AMOUNT,
    area_max: AMOUNT,
    types: /^[a-z]{3,10}(,[a-z]{3,10}){0,7}$/,
    amenities: /^[a-z0-9_-]{1,40}(,[a-z0-9_-]{1,40}){0,29}$/,
    verified_only: /^(true|1)$/,
  },
  "/sales/all": {
    type: /^[a-z_]{1,20}$/,
    price_min: AMOUNT,
    price_max: AMOUNT,
    area_min: AMOUNT,
    area_max: AMOUNT,
    roi_min: AMOUNT,
  },
  "/apartments": {
    source: /^[a-z]{1,10}$/,
  },
};

const NEXT_PATH = /^\/[A-Za-z0-9/_-]{0,100}$/;

function hasControlChars(value: string): boolean {
  return Array.from(value).some((char) => {
    const code = char.charCodeAt(0);
    return code < 32 || code === 127;
  });
}

/** The locale-free pathname, or null when it cannot be read safely. */
function localeFreePath(pathname: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  if (hasControlChars(decoded) || decoded.includes("\\")) return null;
  const stripped = decoded.replace(META_LOCALE_PREFIX, "") || "/";
  return stripped.length > 1 ? stripped.replace(/\/+$/, "") || "/" : "/";
}

function isTokenPath(path: string): boolean {
  const lower = path.toLowerCase();
  return META_TOKEN_ROOTS.some(
    (root) => lower === root || lower.startsWith(`${root}/`),
  );
}

function isSafeNext(value: string): boolean {
  if (!NEXT_PATH.test(value) || value.startsWith("//")) return false;
  const path = localeFreePath(value);
  return path !== null && !isTokenPath(path);
}

function isSafeQueryPair(path: string, key: string, value: string): boolean {
  if (UTM_KEY.test(key)) return value.length <= 200 && !hasControlChars(value);
  if (CLICK_ID_KEYS.has(key)) return CLICK_ID_VALUE.test(value);
  if (path === "/auth/register" && key === "next") return isSafeNext(value);
  const shape = PAGE_KEYS[path]?.[key];
  return shape !== undefined && shape.test(value);
}

/**
 * Whether fbevents may send this address as dl: http(s), no fragment (not
 * even a bare "#"), no token page, and every query key allowed for the page.
 */
export function isSafeMetaUrl(href: string | null | undefined): boolean {
  if (typeof href !== "string" || href.length === 0) return false;
  if (href.length > MAX_HREF_LENGTH || href.includes("#")) return false;
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return false;
  if (url.username || url.password) return false;
  const path = localeFreePath(url.pathname);
  if (path === null || isTokenPath(path)) return false;
  for (const [key, value] of url.searchParams) {
    if (!isSafeQueryPair(path, key, value)) return false;
  }
  return true;
}

/**
 * Whether fbevents may send this referrer as rl. Empty and other sites pass
 * (the browser already trims those); one of our own pages must be a safe URL
 * AND a public page, so a hard navigation from a token page, a private page
 * or a free-text search stays silent.
 */
export function isSafeMetaReferrer(
  referrer: string | null | undefined,
  origin: string,
  isPublicPath: (pathname: string) => boolean,
): boolean {
  if (typeof referrer !== "string" || referrer.length === 0) return true;
  let url: URL;
  try {
    url = new URL(referrer);
  } catch {
    return false;
  }
  if (url.origin !== origin) return true;
  return isSafeMetaUrl(referrer) && isPublicPath(url.pathname);
}

export type MetaCallContext = {
  /** location.href at the moment of sending. */
  href: string;
  /** document.referrer at the moment of sending. */
  referrer: string;
  /** location.origin. */
  origin: string;
  /** The PageviewTracker rule: normalizePublicPageviewPath(p) !== null. */
  isPublicPath: (pathname: string) => boolean;
};

/**
 * The two rules (BRIEF R3, J1): a PageView needs a public page; every event
 * needs a safe URL and a safe referrer. Consent is checked by the caller.
 */
export function metaCallAllowed(
  name: MetaEventName,
  ctx: MetaCallContext,
): boolean {
  if (!isMetaEventName(name)) return false;
  if (!isSafeMetaUrl(ctx.href)) return false;
  if (!isSafeMetaReferrer(ctx.referrer, ctx.origin, ctx.isPublicPath)) {
    return false;
  }
  if (name === "PageView") {
    return ctx.isPublicPath(new URL(ctx.href).pathname);
  }
  return true;
}

export const META_COOKIE_NAMES = ["_fbp", "_fbc"] as const;

/**
 * The document.cookie writes that delete _fbp/_fbc on this host: host-only
 * and every parent domain of two labels or more (fbevents sets them on the
 * site's registrable domain). Never a bare top-level domain such as "ge",
 * and never a domain for an IP address or a one-label host.
 */
export function metaCookieDeletions(hostname: string): string[] {
  const expire = "=; Max-Age=0; path=/";
  const writes: string[] = [];
  const host = hostname.toLowerCase().replace(/\.$/, "");
  const labels = host.split(".");
  const isIp = /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(":");
  const domains: string[] = [];
  if (!isIp && labels.length >= 2 && labels.every((label) => label !== "")) {
    for (let i = 0; i <= labels.length - 2; i += 1) {
      domains.push(labels.slice(i).join("."));
    }
  }
  for (const name of META_COOKIE_NAMES) {
    writes.push(`${name}${expire}`);
    for (const domain of domains) {
      writes.push(`${name}${expire}; domain=.${domain}`);
    }
  }
  return writes;
}
