// Meta Pixel in the browser (C59): the only file that calls fbq( or names
// fbevents.js. Every Meta call goes through here.
//
// Meta's base code, with the deliberate changes the spec's privacy rules need
// (BRIEF): it runs only after advertising consent, and only on the first call
// that may be sent, so a page with nothing to send never loads fbevents.js;
// no advanced matching, no automatic events (autoConfig off), no history
// PageViews (disablePushState: the route drives PageView, once per page), no
// <noscript> image (it would fire without consent). Every call is checked
// against the LIVE address, referrer and consent when it is actually sent
// (fbevents reads location.href itself), so a call queued while the script
// loads is dropped if the visitor moved on to a page that may not be sent.

import { normalizePublicPageviewPath } from "@/lib/analytics/pageview";
import {
  CONSENT_COOKIE_NAME,
  hasMarketingConsent,
  readCookieValue,
} from "@/lib/consent/cookies";
import { META_PIXEL_ID } from "./config";
import {
  META_EVENTS,
  metaCallAllowed,
  metaCookieDeletions,
  type MetaEventName,
} from "./core";

const FBEVENTS_SRC = "https://connect.facebook.net/en_US/fbevents.js";

type Fbq = ((...args: unknown[]) => void) & {
  callMethod?: (...args: unknown[]) => void;
  queue?: unknown[][];
  push?: unknown;
  loaded?: boolean;
  version?: string;
  disablePushState?: boolean;
  allowDuplicatePageViews?: boolean;
};

type MetaWindow = Window & { fbq?: Fbq; _fbq?: Fbq };

type ConversionName = Exclude<MetaEventName, "PageView">;

// Module scope: a layout remount (a language switch, a LocaleShell branch
// change) must not send the same page twice.
let injected = false;
let loaded = false;
let initialised = false;
let revoked = false;
let consentGiven: boolean | null = null;
/** usePathname() of the current route, as last reported. */
let currentRoute: string | null = null;
/** The route whose PageView was sent last; null after a skipped route. */
let lastSentRoute: string | null = null;
/** A PageView waiting for fbevents.js, with location.pathname when asked. */
let pendingPageView: { route: string; livePath: string } | null = null;
const pendingEvents: ConversionName[] = [];

function readConsent(): boolean {
  return hasMarketingConsent(
    readCookieValue(document.cookie, CONSENT_COOKIE_NAME),
  );
}

function allowedNow(name: MetaEventName): boolean {
  return metaCallAllowed(name, {
    href: window.location.href,
    referrer: document.referrer,
    origin: window.location.origin,
    isPublicPath: (pathname) => normalizePublicPageviewPath(pathname) !== null,
  });
}

function getFbq(): Fbq | undefined {
  return (window as MetaWindow).fbq;
}

/** Meta's stub + async fbevents.js, at most once per full page load. */
function inject(): void {
  if (injected || !META_PIXEL_ID) return;
  injected = true;
  const w = window as MetaWindow;
  if (w.fbq) {
    // Someone else's copy is already on the page: never load a second one.
    loaded = true;
    return;
  }
  const stub = function (...args: unknown[]) {
    if (stub.callMethod) stub.callMethod(...args);
    else stub.queue!.push(args);
  } as Fbq;
  stub.push = stub;
  stub.loaded = true;
  stub.version = "2.0";
  stub.queue = [];
  stub.disablePushState = true;
  stub.allowDuplicatePageViews = true;
  w.fbq = stub;
  if (!w._fbq) w._fbq = stub;

  const script = document.createElement("script");
  script.async = true;
  script.src = FBEVENTS_SRC;
  script.onload = () => {
    loaded = true;
    drain();
  };
  // Blocked or offline: drop what waits, never retry in this document.
  script.onerror = () => {
    pendingPageView = null;
    pendingEvents.length = 0;
  };
  document.head.appendChild(script);
}

/** set + init, right before the first hit, so init never runs on a page that sends nothing. */
function initOnce(fbq: Fbq): void {
  if (initialised || !META_PIXEL_ID) return;
  initialised = true;
  fbq("set", "autoConfig", false, META_PIXEL_ID);
  fbq("init", META_PIXEL_ID);
}

function send(name: MetaEventName): void {
  const fbq = getFbq();
  if (!fbq) return;
  initOnce(fbq);
  fbq(META_EVENTS[name], name);
}

/** Sends what is waiting, each call re-checked against the live page. */
function drain(): void {
  if (!loaded) return;
  if (!readConsent()) {
    pendingPageView = null;
    pendingEvents.length = 0;
    return;
  }
  const view = pendingPageView;
  pendingPageView = null;
  if (
    view &&
    view.route === currentRoute &&
    view.route !== lastSentRoute &&
    view.livePath === window.location.pathname &&
    allowedNow("PageView")
  ) {
    send("PageView");
    lastSentRoute = view.route;
  }
  for (const name of pendingEvents.splice(0)) {
    if (allowedNow(name)) send(name);
  }
}

function requestPageView(route: string): void {
  if (route === lastSentRoute) return;
  if (pendingPageView?.route === route) return;
  if (!readConsent() || !allowedNow("PageView")) {
    // Skipped: a later return to the last sent page counts again.
    lastSentRoute = null;
    pendingPageView = null;
    return;
  }
  pendingPageView = { route, livePath: window.location.pathname };
  inject();
  drain();
}

/** Called on every pathname change (MetaPixel). Query and hash changes never call it. */
export function metaOnRoute(pathname: string): void {
  if (!META_PIXEL_ID) return;
  currentRoute = pathname;
  if (consentGiven === null) consentGiven = readConsent();
  requestPageView(pathname);
}

/** Called when the cookie answer changes. Acts on a real change only. */
export function metaOnConsentChange(): void {
  if (!META_PIXEL_ID) return;
  const now = readConsent();
  if (now === consentGiven) return;
  consentGiven = now;
  if (!now) {
    pendingPageView = null;
    pendingEvents.length = 0;
    const fbq = getFbq();
    if (initialised && !revoked && fbq) {
      fbq("consent", "revoke");
      revoked = true;
    }
    for (const write of metaCookieDeletions(window.location.hostname)) {
      document.cookie = write;
    }
    return;
  }
  const fbq = getFbq();
  if (initialised && revoked && fbq) {
    fbq("consent", "grant");
    revoked = false;
  }
  // Accepting mid-page counts the page the visitor is on.
  if (currentRoute !== null) requestPageView(currentRoute);
}

/**
 * The one entry point for the three conversion events (iteration B call sites
 * are pinned by check-contracts C59). No parameters, no ids: only the name.
 */
export function trackMeta(name: ConversionName): void {
  if (!META_PIXEL_ID) return;
  if (!readConsent() || !allowedNow(name)) return;
  pendingEvents.push(name);
  inject();
  drain();
}
