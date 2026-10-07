"use client";

import { useEffect, useState } from "react";
import {
  adRowToCreative,
  landingBannerToCreative,
  type BannerCreative,
} from "@/lib/banner-creative";

type BannerRow = Parameters<typeof landingBannerToCreative>[0] & {
  active: boolean;
};
type AdRow = Parameters<typeof adRowToCreative>[0] & { status: string };

/**
 * The creatives the public loader starts from: enabled banners and active
 * (not paused) ads, through the same adapters. Feed them to
 * selectLiveCreatives() to get exactly what visitors see.
 */
export function enabledBannerCreatives(rows: BannerRow[]): BannerCreative[] {
  return rows
    .filter((row) => row.active)
    .map(landingBannerToCreative)
    .filter((c): c is BannerCreative => c != null);
}

export function enabledAdCreatives(rows: AdRow[]): BannerCreative[] {
  return rows
    .filter((row) => row.status === "active")
    .map(adRowToCreative)
    .filter((c): c is BannerCreative => c != null);
}

/**
 * The OTHER table's enabled creatives, loaded once: ads and editorial banners
 * compete for the same placements, so the banners page needs the live ads (an
 * ad outranks a banner in a single-creative slot) and vice versa. A failed
 * load leaves the list empty; the page then judges by its own table only.
 */
export function useEnabledCreatives(source: "banner" | "ad"): BannerCreative[] {
  const [creatives, setCreatives] = useState<BannerCreative[]>([]);

  useEffect(() => {
    let cancelled = false;
    const url = source === "ad" ? "/api/admin/ads" : "/api/admin/banners";
    fetch(url, { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((payload: { ads?: AdRow[]; banners?: BannerRow[] } | null) => {
        if (cancelled || !payload) return;
        setCreatives(
          source === "ad"
            ? enabledAdCreatives(payload.ads ?? [])
            : enabledBannerCreatives(payload.banners ?? []),
        );
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [source]);

  return creatives;
}
