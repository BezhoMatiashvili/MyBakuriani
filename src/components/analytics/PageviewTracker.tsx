"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { normalizePublicPageviewPath } from "@/lib/analytics/pageview";

// Fires a fire-and-forget page-view beacon on every client-side navigation so
// the admin dashboard can report real visit counts. Never blocks rendering and
// silently ignores failures (mirrors lib/contact-tracking.ts).
export function PageviewTracker() {
  const pathname = usePathname();
  const lastTrackedPath = useRef<string | null>(null);

  useEffect(() => {
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
  }, [pathname]);

  return null;
}
