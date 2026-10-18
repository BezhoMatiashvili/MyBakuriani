/**
 * Admin-generated sign-up links (contract C41). Pure: no `@/` imports, so
 * scripts/unit/signup-links.test.mjs imports it directly.
 *
 * /join/<code> stores the code in SIGNUP_LINK_COOKIE, the email sign-up copies
 * it into user_metadata[SIGNUP_LINK_METADATA_KEY] (a confirmation link opened
 * in another browser has no cookie), and the registration wizard asks
 * /api/signup-links/resolve where to go when it finishes.
 */

export const SIGNUP_LINK_COOKIE = "mb_signup_link";
export const SIGNUP_LINK_COOKIE_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;
export const SIGNUP_LINK_METADATA_KEY = "signup_link";

/** `/dashboard/guest?smartMatch=new` opens the Smart Match request form. */
export const SMART_MATCH_NEW_PARAM = "smartMatch";
export const SMART_MATCH_NEW_VALUE = "new";

/**
 * Destinations an admin picks from. Every path must exist as an app route
 * (check-contracts C41). Labels are AdminSignupLinks.destinations.<key>.
 */
export const SIGNUP_LINK_PRESETS = [
  {
    key: "smartMatch",
    destination: `/dashboard/guest?${SMART_MATCH_NEW_PARAM}=${SMART_MATCH_NEW_VALUE}`,
  },
  { key: "createRental", destination: "/create/rental" },
  { key: "createSale", destination: "/create/sale" },
  { key: "createService", destination: "/create/service" },
  { key: "createFood", destination: "/create/food" },
  { key: "createEntertainment", destination: "/create/entertainment" },
  { key: "createTransport", destination: "/create/transport" },
  { key: "createEmployment", destination: "/create/employment" },
  { key: "dashboard", destination: "/dashboard" },
] as const;

export type SignupLinkPresetKey = (typeof SIGNUP_LINK_PRESETS)[number]["key"];

// Same shape as the signup_links_code_check constraint. No dot: the
// middleware matcher skips dotted paths, so /join/<code> would 404.
const CODE_PATTERN = /^[a-z0-9][a-z0-9-]{2,39}$/;
const CODE_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";
const GENERATED_CODE_LENGTH = 8;

const MAX_DESTINATION_LENGTH = 300;
const CONTROL_OR_BACKSLASH = /[\u0000-\u001f\u007f\\]/;
const LOCALE_PREFIX = /^\/(?:ka|en|ru)(?=\/|\?|#|$)/;
// Sign-in, API and the link route itself: a link must not loop or land on a
// page that would bounce a freshly registered user.
const BLOCKED_PREFIX = /^\/(?:auth|api|join)(?:\/|\?|#|$)/i;

export function normalizeSignupLinkCode(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const code = raw.trim().toLowerCase();
  return CODE_PATTERN.test(code) ? code : null;
}

export function generateSignupLinkCode(): string {
  const bytes = new Uint8Array(GENERATED_CODE_LENGTH);
  crypto.getRandomValues(bytes);
  let code = "";
  for (const byte of bytes) code += CODE_ALPHABET[byte % CODE_ALPHABET.length];
  return code;
}

/**
 * An internal, locale-neutral path or null. A leading /ka, /en or /ru is
 * dropped: the wizard navigates with the visitor's own locale.
 */
export function validateSignupLinkDestination(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const value = raw.trim();
  if (
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.length > MAX_DESTINATION_LENGTH ||
    CONTROL_OR_BACKSLASH.test(value)
  ) {
    return null;
  }
  const base = "https://signup-link.invalid";
  let url: URL;
  try {
    decodeURIComponent(value);
    url = new URL(value, base);
  } catch {
    return null;
  }
  if (url.origin !== base) return null;

  let path = value.replace(LOCALE_PREFIX, "");
  if (!path.startsWith("/")) path = `/${path}`;
  if (path.startsWith("//")) return null;
  if (BLOCKED_PREFIX.test(path)) return null;
  return path;
}

/** The code from a `document.cookie` string, or null. */
export function readSignupLinkCookie(cookieHeader: string): string | null {
  for (const part of cookieHeader.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() !== SIGNUP_LINK_COOKIE) continue;
    try {
      return normalizeSignupLinkCode(decodeURIComponent(part.slice(eq + 1)));
    } catch {
      return null;
    }
  }
  return null;
}
