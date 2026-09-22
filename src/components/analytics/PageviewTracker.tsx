"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { normalizePublicPageviewPath } from "@/lib/analytics/pageview";
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
export function PageviewTracker() {
  const pathname = usePathname();
  const lastTrackedPath = useRef<string | null>(null);
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
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
    if (!allowed) return;
    const normalizedPath = normalizePublicPageviewPath(pathname);
    if (!normalizedPath || lastTrackedPath.current === normalizedPath) return;
    lastTrackedPath.current = normalizedPath;
    try {
      void fetch("/api/track/view", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        keepalive: true,
        body: JSON.stringify({ path: normalizedPath }),
      }).catch(() => {
        // ignore — analytics must never affect the user
      });
    } catch {
      // ignore
    }
  }, [pathname, allowed]);

  return null;
}
