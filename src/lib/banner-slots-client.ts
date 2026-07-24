"use client";

import { useEffect, useState } from "react";
import type { BannerCreative } from "@/lib/banner-creative";
import type { BannerPlacement } from "@/lib/banner-placements";

/**
 * Module-level creative store.
 *
 * A singleton rather than a React context provider: several slots on one page
 * (and repeated client-side navigations) all share one in-flight request and
 * one cached array, without needing a mount point, a placement registry, or a
 * register/batch dance across a render tick. The in-flight promise also absorbs
 * StrictMode's double-invoke in development.
 */
const TTL_MS = 60_000; // matches the route's s-maxage=60

let inflight: Promise<BannerCreative[]> | null = null;
let cached: { at: number; data: BannerCreative[] } | null = null;

export function loadBannerCreatives(): Promise<BannerCreative[]> {
  if (cached && Date.now() - cached.at < TTL_MS) {
    return Promise.resolve(cached.data);
  }
  if (inflight) return inflight;

  inflight = fetch("/api/banner-slots", { signal: AbortSignal.timeout(8_000) })
    .then((r) => (r.ok ? r.json() : null))
    .then((payload) => {
      const data: BannerCreative[] = Array.isArray(payload?.creatives)
        ? payload.creatives
        : [];
      cached = { at: Date.now(), data };
      return data;
    })
    // Banners are decorative — a failed load renders nothing, never an error.
    .catch(() => [] as BannerCreative[])
    .finally(() => {
      inflight = null;
    });

  return inflight;
}

/** Test/dev escape hatch; also used after an admin save in the same tab. */
export function invalidateBannerCreatives(): void {
  cached = null;
}

export function useBannerCreatives(
  placement: BannerPlacement,
): BannerCreative[] {
  const [creatives, setCreatives] = useState<BannerCreative[]>([]);

  useEffect(() => {
    let cancelled = false;
    loadBannerCreatives().then((all) => {
      if (cancelled) return;
      setCreatives(all.filter((c) => c.placement === placement));
    });
    return () => {
      cancelled = true;
    };
  }, [placement]);

  return creatives;
}
