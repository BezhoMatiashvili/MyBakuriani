"use client";

import type { ClientEvent } from "@/lib/analytics/model";
import {
  CONSENT_COOKIE_NAME,
  hasAnalyticsConsent,
  readCookieValue,
} from "@/lib/consent/cookies";

function analyticsAllowed(): boolean {
  try {
    return hasAnalyticsConsent(
      readCookieValue(document.cookie, CONSENT_COOKIE_NAME),
    );
  } catch {
    return false;
  }
}

/** How long a listing view waits for the page view to be answered. */
const PAGEVIEW_WAIT_MS = 2500;
let pageviewWaiters: (() => void)[] = [];

/** PageviewTracker: a page-view beacon was answered (whatever the status). */
export function pageviewAnswered(): void {
  const waiters = pageviewWaiters;
  pageviewWaiters = [];
  for (const resolve of waiters) resolve();
}

/**
 * The page-view beacon issues the analytics cookies (mb_vid, and mb_sid for a
 * new session). A listing view sent before its answer carries neither, so the
 * first page of a visit or of a session (often a listing reached from Google)
 * would lose its visitor and source. Resolves on the next answer, after
 * PAGEVIEW_WAIT_MS at the latest, and at once without analytics consent.
 */
export function afterPageview(): Promise<void> {
  if (!analyticsAllowed()) return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => {
      window.clearTimeout(timer);
      resolve();
    };
    const timer = window.setTimeout(() => {
      pageviewWaiters = pageviewWaiters.filter((waiter) => waiter !== done);
      resolve();
    }, PAGEVIEW_WAIT_MS);
    pageviewWaiters.push(done);
  });
}

/**
 * Reports an action the browser performed itself against Supabase (a saved
 * listing, a Smart Match request) to the admin analytics (C49). The route
 * checks consent again and that the row exists and is the user's.
 * Fire-and-forget: analytics must never affect the action.
 */
export function trackAnalyticsEvent(name: ClientEvent, entityId: string) {
  try {
    if (!analyticsAllowed()) return;
    void fetch("/api/track/event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      keepalive: true,
      body: JSON.stringify({ name, entityId }),
    }).catch(() => {
      // ignore
    });
  } catch {
    // ignore
  }
}
