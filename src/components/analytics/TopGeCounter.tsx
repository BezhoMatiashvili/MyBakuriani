"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { TOP_GE_BADGE_HREF, buildTopGeHit } from "@/lib/analytics/pageview";
import {
  CONSENT_CHANGE_EVENT,
  CONSENT_COOKIE_NAME,
  hasAnalyticsConsent,
  readCookieValue,
} from "@/lib/consent/cookies";
import { IS_INDEXABLE } from "@/lib/seo/site";

// The TOP.GE rating badge (the site is registered there as ID 119119). TOP.GE's
// own counter.js is not loaded: it reports the full address with its query
// (a password-reset token_hash included) and keeps reporting private pages
// after any client navigation. The badge image's request IS the hit, so it is
// built here from a public page address only (buildTopGeHit).
//
// Nothing renders and nothing is sent unless this build is for the canonical
// host (IS_INDEXABLE), the visitor allowed analytics (PageviewTracker's rule)
// and the page is a public one. The server and the first client render are
// empty, so there is no hydration difference and the ISR pages stay
// cookie-free (C28).

// The last page reported in this document, the next hit's referrer. Module
// scope, so a Footer remount (LocaleShell switches branch) keeps it.
let lastPage: string | null = null;

export function TopGeCounter() {
  const pathname = usePathname();
  const [allowed, setAllowed] = useState(false);
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    if (!IS_INDEXABLE) return;
    const read = () =>
      setAllowed(
        hasAnalyticsConsent(
          readCookieValue(document.cookie, CONSENT_COOKIE_NAME),
        ),
      );
    read();
    // Answering the banner re-reads the cookie. The location answer fires the
    // same event, but `allowed` is unchanged then, so it is no second hit.
    window.addEventListener(CONSENT_CHANGE_EVENT, read);
    return () => window.removeEventListener(CONSENT_CHANGE_EVENT, read);
  }, []);

  // pathname only triggers a new hit; the address itself is read from the
  // window, where the router has already put the new URL.
  useEffect(() => {
    const hit = allowed
      ? buildTopGeHit({
          origin: window.location.origin,
          pathname: window.location.pathname,
          referrer: lastPage ?? document.referrer,
          rand: 1e4 * Math.random(),
          width: window.screen.width,
          height: window.screen.height,
          depth: window.screen.colorDepth || window.screen.pixelDepth,
        })
      : null;
    if (hit) lastPage = hit.page;
    setSrc(hit ? hit.url : null);
  }, [pathname, allowed]);

  if (!src) return null;
  return (
    <a
      href={TOP_GE_BADGE_HREF}
      target="_blank"
      rel="noopener noreferrer"
      className="flex min-h-11 min-w-11 items-center justify-center"
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- never next/image: this request IS the hit, and the optimizer would send it from the server, cached. Never lazy either. */}
      <img
        src={src}
        alt="TOP.GE"
        title="TOP.GE"
        // A blocked or failed hit (ad blockers list counter hosts) would draw a
        // broken-image icon: drop the badge; the next page view tries again.
        onError={() => setSrc(null)}
      />
    </a>
  );
}
