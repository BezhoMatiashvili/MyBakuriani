"use client";

import { useCallback, useEffect, useRef } from "react";
import type { BannerCreative } from "@/lib/banner-creative";
import type { BannerEvent } from "@/lib/banner-analytics";

/**
 * View / open / click beacons for every creative the banner system draws, paid
 * ads and editorial banners alike (contract C46). The server counts them per
 * Tbilisi day into `banner_metrics_daily`; the admin ad-analytics page reads it.
 *
 * Nothing identifying is sent or stored: the body is `{source, id, event}` and
 * the dedupe list lives in this tab's sessionStorage only.
 */
const SEEN_KEY: Record<BannerEvent, string> = {
  view: "mybakuriani:banner_views",
  open: "mybakuriani:banner_opens",
  click: "mybakuriani:banner_clicks",
};

/** ≥50% of the creative visible for this long before it counts as seen. */
const DWELL_MS = 1_000;
const VISIBILITY_RATIO = 0.5;

// Fallback when sessionStorage is unavailable (private mode / blocked).
const seenInMemory = new Set<string>();

function alreadyCounted(event: BannerEvent, creativeId: string): boolean {
  if (seenInMemory.has(`${event}|${creativeId}`)) return true;
  try {
    const raw = window.sessionStorage.getItem(SEEN_KEY[event]);
    return raw ? (JSON.parse(raw) as string[]).includes(creativeId) : false;
  } catch {
    return false;
  }
}

function markCounted(event: BannerEvent, creativeId: string): void {
  seenInMemory.add(`${event}|${creativeId}`);
  try {
    const raw = window.sessionStorage.getItem(SEEN_KEY[event]);
    const seen = raw ? (JSON.parse(raw) as string[]) : [];
    if (!seen.includes(creativeId)) {
      window.sessionStorage.setItem(
        SEEN_KEY[event],
        JSON.stringify([...seen, creativeId]),
      );
    }
  } catch {
    // storage unavailable — the in-memory set still dedupes this page load
  }
}

function send(
  source: BannerCreative["source"],
  sourceId: string,
  event: BannerEvent,
): void {
  const body = JSON.stringify({ source, id: sourceId, event });
  try {
    if (typeof navigator !== "undefined" && navigator.sendBeacon) {
      navigator.sendBeacon(
        "/api/banner-slots/track",
        new Blob([body], { type: "application/json" }),
      );
      return;
    }
  } catch {
    // fall through to fetch
  }
  void fetch("/api/banner-slots/track", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
    keepalive: true,
  }).catch(() => {});
}

/**
 * Counts an open (detail window) or a click (followed the link), once per tab
 * session per creative — three clicks on one view must not read as 300% CTR.
 * Call it only from interactive surfaces: the admin preview renders inert
 * elements, so it can never reach this.
 */
export function reportBannerEvent(
  creative: BannerCreative,
  event: "open" | "click",
): void {
  if (alreadyCounted(event, creative.id)) return;
  markCounted(event, creative.id);
  send(creative.source, creative.sourceId, event);
}

/**
 * Returns a ref for the creative's root element; a view is counted once it has
 * been at least half on screen for DWELL_MS. Inert when `enabled` is false (the
 * admin preview must never inflate live numbers).
 */
export function useBannerViewTracking(
  creative: BannerCreative,
  enabled: boolean,
): (node: HTMLElement | null) => void {
  const nodeRef = useRef<HTMLElement | null>(null);
  const firedRef = useRef(false);
  // Primitives, not the object: the store hands out a fresh object on every
  // refresh, which must not restart the dwell timer.
  const { id: creativeId, source, sourceId } = creative;

  useEffect(() => {
    if (!enabled) return;
    const node = nodeRef.current;
    if (!node || typeof IntersectionObserver === "undefined") return;
    if (firedRef.current || alreadyCounted("view", creativeId)) return;

    let timer: ReturnType<typeof setTimeout> | null = null;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            if (timer === null) {
              timer = setTimeout(() => {
                if (firedRef.current) return;
                firedRef.current = true;
                markCounted("view", creativeId);
                send(source, sourceId, "view");
                observer.disconnect();
              }, DWELL_MS);
            }
          } else if (timer !== null) {
            // Scrolled away before the dwell threshold — not a view.
            clearTimeout(timer);
            timer = null;
          }
        }
      },
      { threshold: VISIBILITY_RATIO },
    );

    observer.observe(node);
    return () => {
      if (timer !== null) clearTimeout(timer);
      observer.disconnect();
    };
  }, [enabled, creativeId, source, sourceId]);

  return useCallback((node: HTMLElement | null) => {
    nodeRef.current = node;
  }, []);
}
