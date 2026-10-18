// Cookie-consent state, kept deliberately free of runtime "@/" imports so
// scripts/unit/consent.test.mjs can import it straight from src/ (see C29).
//
// Three categories live in this codebase: Essential (mb_gate,
// sb-*-auth-token, not declinable), Analytics (mb_vid and the session cookie
// mb_sid, both issued by /api/track/view, C49), and, as of 2026-09-28,
// Location - browser geolocation
// permission for the personalized road-status card and per-listing "show me
// the route" maps (see src/lib/geolocation/useUserLocation.ts). Location has
// no cookie of its own; the yes/no answer is recorded here, but the
// coordinates themselves are never persisted anywhere (not this cookie, not
// storage - see useUserLocation's doc comment). The Privacy Policy
// (/privacy#cookies) may need a matching update for the new category; that
// page is out of scope for this change. There is still no third-party ad or
// analytics script anywhere, so no Marketing category is offered.

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
  /**
   * Whether geolocation is allowed. `null` means "never asked" - the only
   * way to reach that is a legacy v1 cookie (analytics-only, written before
   * this category existed); a v2 write always sets an explicit true/false.
   * Callers must treat null the same as "no consent", never as a default yes.
   */
  location: boolean | null;
};

/** Bumped from v1 when the `location` category was added; v1 stays readable. */
const VERSION = "v2";
const LEGACY_VERSION = "v1";

/** `v2|analytics=1|location=0` - short, opaque, and cheap to send on every request. */
export function serializeCookieConsent(consent: CookieConsent): string {
  const fields = [`analytics=${consent.analytics ? 1 : 0}`];
  if (consent.location !== null) {
    fields.push(`location=${consent.location ? 1 : 0}`);
  }
  return `${VERSION}|${fields.join("|")}`;
}

/**
 * Returns null when the visitor has not answered the (required) analytics
 * question yet, or the cookie is malformed. Null must be treated as "no
 * consent" by callers - never as a default yes. A v1 cookie (or a v2 cookie
 * that never got a location answer) parses with `location: null`, which
 * callers must likewise treat as "not decided", never as true or false.
 */
export function parseCookieConsent(
  raw: string | null | undefined,
): CookieConsent | null {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > 128) {
    return null;
  }
  const [version, ...rest] = raw.split("|");
  if (version !== VERSION && version !== LEGACY_VERSION) return null;

  const fields: Record<string, string> = {};
  for (const part of rest) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    fields[part.slice(0, eq)] = part.slice(eq + 1);
  }

  if (fields.analytics !== "1" && fields.analytics !== "0") return null;
  const analytics = fields.analytics === "1";

  const location =
    fields.location === "1" ? true : fields.location === "0" ? false : null;

  return { analytics, location };
}

/** The single predicate every analytics path must consult. */
export function hasAnalyticsConsent(raw: string | null | undefined): boolean {
  return parseCookieConsent(raw)?.analytics === true;
}

/** The single predicate every geolocation path must consult. */
export function hasLocationConsent(raw: string | null | undefined): boolean {
  return parseCookieConsent(raw)?.location === true;
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
