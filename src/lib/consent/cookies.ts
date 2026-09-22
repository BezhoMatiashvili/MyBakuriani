// Cookie-consent state, kept deliberately free of runtime "@/" imports so
// scripts/unit/consent.test.mjs can import it straight from src/ (see C29).
//
// The Privacy Policy (/privacy#cookies) names three categories, but only two
// exist in this codebase: Essential (mb_gate, sb-*-auth-token) and Analytics
// (mb_vid, issued by /api/track/view). There is no third-party ad or analytics
// script anywhere, so no Marketing category is offered rather than inventing one.

export const CONSENT_COOKIE_NAME = "mb_cookie_consent";

/** 12 months - the usual ceiling for a consent record. */
export const CONSENT_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

/**
 * Fired on `window` after the visitor answers, so already-mounted components
 * (PageviewTracker) can re-read the cookie without a page reload.
 */
export const CONSENT_CHANGE_EVENT = "mb-consent-change";

/** Dispatched by the footer link to re-open the banner for a second choice. */
export const CONSENT_OPEN_EVENT = "mb-consent-open";

export type CookieConsent = {
  /** Essential is always true and is not stored - it cannot be declined. */
  analytics: boolean;
};

const VERSION = "v1";

/** `v1|analytics=1` - short, opaque, and cheap to send on every request. */
export function serializeCookieConsent(consent: CookieConsent): string {
  return `${VERSION}|analytics=${consent.analytics ? 1 : 0}`;
}

/**
 * Returns null when the visitor has not answered yet (no cookie, or a value
 * this version does not understand). Null must be treated as "no consent" by
 * callers - never as a default yes.
 */
export function parseCookieConsent(
  raw: string | null | undefined,
): CookieConsent | null {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > 128) {
    return null;
  }
  const [version, ...rest] = raw.split("|");
  if (version !== VERSION) return null;
  for (const part of rest) {
    const [key, value] = part.split("=");
    if (key === "analytics") {
      if (value === "1") return { analytics: true };
      if (value === "0") return { analytics: false };
      return null;
    }
  }
  return null;
}

/** The single predicate every analytics path must consult. */
export function hasAnalyticsConsent(raw: string | null | undefined): boolean {
  return parseCookieConsent(raw)?.analytics === true;
}

/**
 * Reads one cookie out of a `document.cookie` / `Cookie:` header string.
 * Kept here so the client and the API route agree on the parsing rules.
 */
export function readCookieValue(
  cookieString: string | null | undefined,
  name: string,
): string | null {
  if (typeof cookieString !== "string" || cookieString.length === 0) {
    return null;
  }
  for (const pair of cookieString.split(";")) {
    const index = pair.indexOf("=");
    if (index === -1) continue;
    if (pair.slice(0, index).trim() !== name) continue;
    const value = pair.slice(index + 1).trim();
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  }
  return null;
}
