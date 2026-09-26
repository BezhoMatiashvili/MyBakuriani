"use client";

import { useEffect, useState } from "react";

/**
 * Records one detail-page view and returns the listing's live view count.
 *
 * The 8 public detail routes are ISR + edge-cached and cookie-free (C28), so
 * the count baked into their HTML lags by minutes and never includes this
 * visit; the beacon answers with the current one (C22). Mock/demo listings
 * pass enabled=false.
 */
export function useListingViewCount(
  kind: "property" | "service",
  id: string,
  initial: number | null | undefined,
  enabled = true,
): number {
  const [views, setViews] = useState(initial ?? 0);

  useEffect(() => {
    if (!enabled) return;
    fetch(`/api/listings/${kind}/${id}/view`, { method: "POST" })
      .then((res) => res.json())
      .then((body: { views?: unknown }) => {
        // 404 (pending preview) / 403 carry no count.
        if (typeof body.views !== "number") return;
        const live = body.views;
        // Counts only grow; a late reply (StrictMode double effect, two tabs)
        // must not move it back.
        setViews((current) => Math.max(current, live));
      })
      .catch(() => {});
  }, [kind, id, enabled]);

  return views;
}
