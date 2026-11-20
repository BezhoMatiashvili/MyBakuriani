// Google Analytics 4 in the browser (C62): the only file that calls gtag( or
// names gtag/js. Every GA hit goes through here.
//
// Google's gtag.js snippet, with the changes the site's privacy rules need:
// - "basic" consent mode: nothing (not even the script) loads before the
//   visitor's Analytics + Google yes (hasGaConsent), and only on the first
//   public page view or event, so a private page never loads it;
// - no automatic page_view (send_page_view false, SET before config; the
//   stream's enhanced measurement is off), so a history change never reports a raw address:
//   the route sends one page_view per public page, and every hit carries a
//   page_location / page_referrer cut down by cleanTrackedUrl (no token, no
//   free-text query, no fragment);
// - ad storage, ad user data, ad personalisation and Google signals stay off;
// - withdrawal: consent update to denied, ga-disable-<id>, _ga cookies deleted.

import { normalizePublicPageviewPath } from "@/lib/analytics/pageview";
import {
  CONSENT_COOKIE_NAME,
  hasGaConsent,
  readCookieValue,
} from "@/lib/consent/cookies";
import {
  cleanTrackedReferrer,
  cleanTrackedUrl,
  cookieDeletions,
} from "@/lib/meta/core";
import { GA_MEASUREMENT_ID } from "./config";
import {
  gaCookieNames,
  gaEventParams,
  isGaEventName,
  type GaEventName,
  type GaEventParams,
} from "./core";

type GaWindow = { dataLayer?: unknown[]; [key: string]: unknown };

// Module scope: a layout remount must not count the same page twice.
let injected = false;
let consentGiven: boolean | null = null;
/** usePathname() of the current route, as last reported. */
let currentRoute: string | null = null;
/** The route whose page_view was sent last; null after a skipped route. */
let lastSentRoute: string | null = null;
/** The cleaned address of the last page_view: the next page's referrer. */
let lastLocation: string | null = null;

// gtag.js reads the Arguments object itself, so this must push `arguments`.
const gtag: (...args: unknown[]) => void = function () {
  const w = window as unknown as GaWindow;
  w.dataLayer = w.dataLayer || [];
  // eslint-disable-next-line prefer-rest-params
  w.dataLayer.push(arguments);
};

/** Stands in for every non-public page (no id, no title). */
const PRIVATE_PATH = "/private";
const PRIVATE_TITLE = "MyBakuriani";

function readConsent(): boolean {
  return hasGaConsent(readCookieValue(document.cookie, CONSENT_COOKIE_NAME));
}

function isPublicPage(pathname: string): boolean {
  return normalizePublicPageviewPath(pathname) !== null;
}

/**
 * What every hit reports as the page. A private page (cabinet, admin, sign-in,
 * token links) is never named: its address is PRIVATE_PATH and its title the
 * site name, also as the next page's referrer, so neither an id in the path
 * nor a name in the title reaches Google.
 */
function pageFields(): Record<string, string> {
  const origin = window.location.origin;
  const isPublic = isPublicPage(window.location.pathname);
  let referrer =
    lastLocation ?? cleanTrackedReferrer(document.referrer, origin);
  if (referrer.startsWith(`${origin}/`)) {
    const path = new URL(referrer).pathname;
    if (path !== PRIVATE_PATH && !isPublicPage(path)) {
      referrer = `${origin}${PRIVATE_PATH}`;
    }
  }
  return {
    page_location: isPublic
      ? (cleanTrackedUrl(window.location.href) ?? `${origin}/`)
      : `${origin}${PRIVATE_PATH}`,
    page_referrer: referrer,
    page_title: isPublic ? document.title : PRIVATE_TITLE,
  };
}

// Must be SET before config: today's Google tag ignores send_page_view inside
// the config call and sends its own page_view with the raw location.href
// (measured 2026-11-20 against the live gtag.js).
const GA_DEFAULTS = {
  send_page_view: false,
  allow_google_signals: false,
  allow_ad_personalization_signals: false,
};

/** The queue, consent defaults, config and async gtag.js, once per document. */
function inject(): void {
  if (injected || !GA_MEASUREMENT_ID) return;
  injected = true;
  gtag("consent", "default", {
    ad_storage: "denied",
    ad_user_data: "denied",
    ad_personalization: "denied",
    analytics_storage: "granted",
  });
  gtag("set", "ads_data_redaction", true);
  gtag("set", GA_DEFAULTS);
  gtag("set", pageFields());
  gtag("js", new Date());
  gtag("config", GA_MEASUREMENT_ID, GA_DEFAULTS);
  const script = document.createElement("script");
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`;
  document.head.appendChild(script);
}

function sendPageView(route: string): void {
  if (route === lastSentRoute) return;
  if (!isPublicPage(window.location.pathname)) {
    // A private page: no page_view, and gtag (if already loaded) reports
    // only PRIVATE_PATH for anything it sends on its own.
    lastSentRoute = null;
    if (injected) gtag("set", pageFields());
    return;
  }
  inject();
  const fields = pageFields();
  gtag("set", fields);
  gtag("event", "page_view", fields);
  lastSentRoute = route;
  lastLocation = fields.page_location;
}

/** Called on every pathname change (GoogleAnalytics). */
export function gaOnRoute(pathname: string): void {
  if (!GA_MEASUREMENT_ID) return;
  currentRoute = pathname;
  if (consentGiven === null) consentGiven = readConsent();
  if (!consentGiven) {
    lastSentRoute = null;
    return;
  }
  sendPageView(pathname);
}

/** Called when the cookie answer changes. Acts on a real change only. */
export function gaOnConsentChange(): void {
  if (!GA_MEASUREMENT_ID) return;
  const now = readConsent();
  if (now === consentGiven) return;
  consentGiven = now;
  const w = window as unknown as GaWindow;
  if (!now) {
    if (injected) gtag("consent", "update", { analytics_storage: "denied" });
    w[`ga-disable-${GA_MEASUREMENT_ID}`] = true;
    for (const write of cookieDeletions(
      gaCookieNames(GA_MEASUREMENT_ID),
      window.location.hostname,
    )) {
      document.cookie = write;
    }
    lastSentRoute = null;
    return;
  }
  w[`ga-disable-${GA_MEASUREMENT_ID}`] = false;
  if (injected) gtag("consent", "update", { analytics_storage: "granted" });
  // Accepting mid-page counts the page the visitor is on.
  if (currentRoute !== null) sendPageView(currentRoute);
}

/** One named event (GA_EVENTS), via trackGa only. */
export function gaEvent(name: GaEventName, params?: GaEventParams): void {
  if (!GA_MEASUREMENT_ID || !isGaEventName(name) || !readConsent()) return;
  inject();
  gtag("set", pageFields());
  gtag("event", name, gaEventParams(name, params));
}
