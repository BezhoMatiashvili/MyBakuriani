// Traffic source of an analytics session (C49, spec §4): exactly one of the
// five buckets the owner listed. Decided once per session from the landing hit
// (external referrer host, utm_source, click ids, in-app browser) and carried
// in the mb_sid cookie. Pure (type imports only) so scripts/unit can load it.
import type { TrafficSource } from "./model";

export type SourceSignals = {
  /** Host of document.referrer on the landing hit (normalizeHost). */
  referrerHost: string | null;
  utmSource: string | null;
  gclid: boolean;
  fbclid: boolean;
  userAgent: string | null;
};

const OWN_HOST =
  /(^|\.)mybakuriani\.(ge|com|com\.ge)$|(^|\.)ondigitalocean\.app$|^localhost$|^127\.0\.0\.1$/;

/** A referrer value (URL or host) reduced to a lower-case host, else null. */
export function normalizeHost(value: unknown): string | null {
  if (typeof value !== "string") return null;
  let host = value.trim().toLowerCase();
  if (!host || host.length > 2048) return null;
  if (host.includes("://")) {
    try {
      host = new URL(host).hostname;
    } catch {
      return null;
    }
  }
  host = host.replace(/^www\./, "").replace(/\.$/, "");
  if (host.length > 253 || !/^[a-z0-9.-]+$/.test(host)) return null;
  if (!host.includes(".") && host !== "localhost") return null;
  return host;
}

export function isOwnHost(host: string): boolean {
  return OWN_HOST.test(host);
}

const INSTAGRAM_UA = /\bInstagram\b/i;
const FACEBOOK_UA = /\bFBAN\/|\bFBAV\/|\bFB_IAB\/|\bFBIOS\b/i;

// The name ends the tag or is followed by a separator ("ig_story", "fb-ads"):
// \b would treat "_" as part of the word.
function fromUtm(utm: string): TrafficSource {
  const v = utm.trim().toLowerCase();
  if (/^(google|adwords|gads|googleads)(?![a-z0-9])/.test(v)) return "google";
  if (/^(instagram|ig)(?![a-z0-9])/.test(v)) return "instagram";
  if (/^(facebook|fb|meta)(?![a-z0-9])/.test(v)) return "facebook";
  return "referral";
}

function fromHost(host: string): TrafficSource {
  if (
    /(^|\.)google(\.[a-z]{2,3}){1,2}$/.test(host) ||
    /(^|\.)(googleadservices|googlesyndication|doubleclick)\.(com|net)$/.test(
      host,
    )
  ) {
    return "google";
  }
  if (/(^|\.)instagram\.com$/.test(host)) return "instagram";
  if (/(^|\.)(facebook\.com|fb\.com|fb\.me|messenger\.com)$/.test(host)) {
    return "facebook";
  }
  return "referral";
}

/**
 * utm_source wins (an explicit campaign tag), then click ids, then the in-app
 * browser, then the referrer. Nothing external = direct. Other search engines
 * and sites are "referral": the owner's list has exactly five buckets.
 */
export function classifySource(signals: SourceSignals): TrafficSource {
  if (signals.utmSource && signals.utmSource.trim()) {
    return fromUtm(signals.utmSource);
  }
  const ua = signals.userAgent ?? "";
  if (signals.gclid) return "google";
  if (signals.fbclid) return INSTAGRAM_UA.test(ua) ? "instagram" : "facebook";
  if (INSTAGRAM_UA.test(ua)) return "instagram";
  if (FACEBOOK_UA.test(ua)) return "facebook";
  const host =
    signals.referrerHost && !isOwnHost(signals.referrerHost)
      ? signals.referrerHost
      : null;
  return host ? fromHost(host) : "direct";
}

/** Whether the hit arrived from outside (a campaign tag or another site). */
export function hasExternalSignal(signals: SourceSignals): boolean {
  return Boolean(
    (signals.utmSource && signals.utmSource.trim()) ||
    signals.gclid ||
    signals.fbclid ||
    (signals.referrerHost && !isOwnHost(signals.referrerHost)),
  );
}
