"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

// Fires a fire-and-forget page-view beacon on every client-side navigation so
// the admin dashboard can report real visit counts. Never blocks rendering and
// silently ignores failures (mirrors lib/contact-tracking.ts).
export function PageviewTracker() {
  const pathname = usePathname();

  useEffect(() => {
    if (!pathname) return;
    try {
      void fetch("/api/track/view", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        keepalive: true,
        body: JSON.stringify({ path: pathname }),
      }).catch(() => {
        // ignore — analytics must never affect the user
      });
    } catch {
      // ignore
    }
  }, [pathname]);

  return null;
}
