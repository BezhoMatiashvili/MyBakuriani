"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { KEEPALIVE_MS } from "@/lib/analytics/model";
import { normalizePublicPageviewPath } from "@/lib/analytics/pageview";
import { pageviewAnswered } from "@/lib/analytics/track-client";
import {
  CONSENT_CHANGE_EVENT,
  CONSENT_COOKIE_NAME,
  hasAnalyticsConsent,
  readCookieValue,
} from "@/lib/consent/cookies";

// Fires a fire-and-forget page-view beacon on every client-side navigation so
// the admin dashboard can report real visit counts. Never blocks rendering and
// silently ignores failures (mirrors lib/contact-tracking.ts).
//
// Gated on analytics cookie consent. Without it nothing is sent, so the
// mb_vid cookie is never issued either - /api/track/view re-checks the same
// cookie server-side, so this is convenience, not the only enforcement.
//
// C49: the first tracked view of a document also carries where the visitor
// came from (the referrer's host only, utm_* tags, whether a Google/Facebook
// click id was present), and every view reports the time the page was visible
// (/api/track/ping) when it is hidden or left, plus a keepalive every 2
// minutes while the visitor is active (Live Now).

type LandingSignals = {
  ref?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  gclid?: true;
  fbclid?: true;
};

/** One tracked page view and its visible time not yet reported. */
type Hit = {
  id: string | null;
  ms: number;
  /** performance.now() when the page last became visible; null while hidden. */
  since: number | null;
  /** The visitor left it: report what is left once the id arrives. */
  closed: boolean;
};

/** A keepalive is sent only if the visitor did something this recently. */
const ACTIVE_WINDOW_MS = 2 * 60 * 1000;
const ACTIVITY_EVENTS = ["pointerdown", "keydown", "scroll", "touchstart"];

// Read once per document at the tracker's first mount, sent with the first
// tracked view (which may come later: the visitor landed on an untracked page
// or accepted cookies after a while), then consumed. Module scope, so a layout
// remount (a language switch) does not report the same landing twice.
let landingSignals: LandingSignals | null | undefined;

function readLandingSignals(): LandingSignals {
  const signals: LandingSignals = {};
  try {
    if (document.referrer) {
      const host = new URL(document.referrer).hostname;
      if (host && host !== window.location.hostname) signals.ref = host;
    }
  } catch {
    // an unreadable referrer is no referrer
  }
  const params = new URLSearchParams(window.location.search);
  for (const key of ["utm_source", "utm_medium", "utm_campaign"] as const) {
    const value = params.get(key);
    if (value) signals[key] = value.slice(0, 100);
  }
  if (params.has("gclid")) signals.gclid = true;
  if (params.has("fbclid")) signals.fbclid = true;
  return signals;
}

function takeLandingSignals(): LandingSignals {
  const signals = landingSignals ?? {};
  landingSignals = null;
  return signals;
}

function sendPing(id: string, ms: number) {
  const body = JSON.stringify({ id, ms: Math.round(ms) });
  try {
    if (navigator.sendBeacon?.("/api/track/ping", body)) return;
    void fetch("/api/track/ping", {
      method: "POST",
      keepalive: true,
      body,
    }).catch(() => {
      // ignore — analytics must never affect the user
    });
  } catch {
    // ignore
  }
}

/** Adds the visible time up to now and reports it once the view has an id. */
function report(hit: Hit) {
  const now = performance.now();
  if (hit.since !== null) {
    hit.ms += now - hit.since;
    hit.since =
      !hit.closed && document.visibilityState === "visible" ? now : null;
  }
  if (!hit.id || hit.ms < 1) return;
  sendPing(hit.id, hit.ms);
  hit.ms = 0;
}

function closeHit(hit: Hit | null) {
  if (!hit) return;
  report(hit);
  hit.closed = true;
  hit.since = null;
}

export function PageviewTracker() {
  const pathname = usePathname();
  const lastTrackedPath = useRef<string | null>(null);
  const hit = useRef<Hit | null>(null);
  const lastActive = useRef(0);
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    if (landingSignals === undefined) landingSignals = readLandingSignals();
    const read = () =>
      setAllowed(
        hasAnalyticsConsent(
          readCookieValue(document.cookie, CONSENT_COOKIE_NAME),
        ),
      );
    read();
    // Re-read when the banner is answered, so accepting starts tracking
    // without requiring a reload.
    window.addEventListener(CONSENT_CHANGE_EVENT, read);
    return () => window.removeEventListener(CONSENT_CHANGE_EVENT, read);
  }, []);

  useEffect(() => {
    const onVisibility = () => {
      const current = hit.current;
      if (!current || current.closed) return;
      if (document.visibilityState === "visible") {
        current.since = performance.now();
      } else {
        report(current);
      }
    };
    const onPageHide = () => {
      if (hit.current) report(hit.current);
    };
    const onActivity = () => {
      lastActive.current = Date.now();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onPageHide);
    for (const type of ACTIVITY_EVENTS) {
      window.addEventListener(type, onActivity, {
        passive: true,
        capture: true,
      });
    }
    const keepalive = window.setInterval(() => {
      const current = hit.current;
      if (
        current &&
        document.visibilityState === "visible" &&
        Date.now() - lastActive.current <= ACTIVE_WINDOW_MS
      ) {
        report(current);
      }
    }, KEEPALIVE_MS);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onPageHide);
      for (const type of ACTIVITY_EVENTS) {
        window.removeEventListener(type, onActivity, { capture: true });
      }
      window.clearInterval(keepalive);
    };
  }, []);

  useEffect(() => {
    if (!allowed) {
      hit.current = null;
      lastTrackedPath.current = null;
      return;
    }
    const normalizedPath = normalizePublicPageviewPath(pathname);
    if (normalizedPath && lastTrackedPath.current === normalizedPath) return;
    // Leaving a page (for another one, tracked or not) ends its visible time.
    closeHit(hit.current);
    hit.current = null;
    lastTrackedPath.current = normalizedPath;
    if (!normalizedPath) return;

    const current: Hit = {
      id: null,
      ms: 0,
      since: document.visibilityState === "visible" ? performance.now() : null,
      closed: false,
    };
    hit.current = current;
    try {
      void fetch("/api/track/view", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        keepalive: true,
        body: JSON.stringify({
          path: normalizedPath,
          tp: navigator.maxTouchPoints,
          ...takeLandingSignals(),
        }),
      })
        .then(async (res) => {
          if (res.status !== 200) return;
          const data = (await res.json()) as { id?: unknown };
          if (typeof data.id !== "string") return;
          current.id = data.id;
          if (current.closed || document.visibilityState !== "visible") {
            report(current);
          }
        })
        .catch(() => {
          // ignore — analytics must never affect the user
        })
        // The analytics cookies exist now: a waiting listing view may go.
        .finally(pageviewAnswered);
    } catch {
      // ignore
    }
  }, [pathname, allowed]);

  return null;
}
