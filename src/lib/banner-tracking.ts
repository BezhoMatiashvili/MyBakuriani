"use client";

import { useCallback, useEffect, useRef } from "react";
import type { BannerCreative } from "@/lib/banner-creative";

/**
 * Impression + click counters for ad creatives.
 *
 * Only `ads` rows carry counters (`views_count` / `clicks_count`) and only the
 * B2B admin page displays them, so editorial banners are deliberately not
 * tracked — there is nowhere to show the number.
 */
const VIEW_KEY = "mybakuriani:ad_impressions";
const CLICK_KEY = "mybakuriani:ad_clicks";

/** ≥50% of the creative visible for this long before it counts as seen. */
const DWELL_MS = 1_000;
const VISIBILITY_RATIO = 0.5;

function alreadyCounted(key: string, id: string): boolean {
  try {
    const raw = window.sessionStorage.getItem(key);
    return raw ? (JSON.parse(raw) as string[]).includes(id) : false;
  } catch {
    return false;
  }
}

function markCounted(key: string, id: string): void {
  try {
    const raw = window.sessionStorage.getItem(key);
    const seen = raw ? (JSON.parse(raw) as string[]) : [];
    if (!seen.includes(id)) {
      window.sessionStorage.setItem(key, JSON.stringify([...seen, id]));
    }
  } catch {
    // sessionStorage unavailable (private mode / blocked) — degrade to
    // per-mount dedupe only.
  }
}

function send(id: string, event: "view" | "click"): void {
  const body = JSON.stringify({ id, event });
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
 * Returns a ref to attach to the creative's root element, plus a click reporter.
 * Both are inert for non-sponsored creatives and when `enabled` is false (the
 * admin preview must never inflate a live advertiser's numbers).
 */
export function useBannerTracking(
  creative: BannerCreative,
  enabled: boolean,
): {
  ref: (node: HTMLElement | null) => void;
  reportClick: () => void;
} {
  const nodeRef = useRef<HTMLElement | null>(null);
  const firedRef = useRef(false);
  const active = enabled && creative.sponsored;
  const sourceId = creative.sourceId;

  useEffect(() => {
    if (!active) return;
    const node = nodeRef.current;
    if (!node || typeof IntersectionObserver === "undefined") return;
    if (firedRef.current || alreadyCounted(VIEW_KEY, sourceId)) return;

    let timer: ReturnType<typeof setTimeout> | null = null;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            if (timer === null) {
              timer = setTimeout(() => {
                if (firedRef.current) return;
                firedRef.current = true;
                markCounted(VIEW_KEY, sourceId);
                send(sourceId, "view");
                observer.disconnect();
              }, DWELL_MS);
            }
          } else if (timer !== null) {
            // Scrolled away before the dwell threshold — not an impression.
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
  }, [active, sourceId]);

  const ref = useCallback((node: HTMLElement | null) => {
    nodeRef.current = node;
  }, []);

  const reportClick = useCallback(() => {
    if (!active) return;
    // Deduped per session exactly like impressions are. Without this, three
    // clicks on one impression would report a 300% CTR.
    if (alreadyCounted(CLICK_KEY, sourceId)) return;
    markCounted(CLICK_KEY, sourceId);
    send(sourceId, "click");
  }, [active, sourceId]);

  return { ref, reportClick };
}
