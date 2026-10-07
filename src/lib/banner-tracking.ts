"use client";

import { useCallback, useEffect, useRef } from "react";
import type { BannerCreative } from "@/lib/banner-creative";
import { BANNER_BATCH_MAX, type BannerEvent } from "@/lib/banner-analytics";

/**
 * Impression / open / click beacons for every creative the banner system
 * draws, paid ads and editorial banners alike (contracts C46, C47). The server
 * counts them per Tbilisi day into `banner_metrics_daily` (and the ad-position
 * denominator into `banner_slot_daily`); the admin ad-analytics page reads it.
 *
 * Nothing identifying is sent or stored server-side. The body is a batch of
 * `{t, source, id}` events with three yes/no flags; what decides those flags
 * stays in this browser:
 *   - sessionStorage `mybakuriani:banner_views|opens|clicks`: creatives already
 *     counted this tab session (a view = the first impression of a session,
 *     and opens/clicks count once a session, as C46 defined them);
 *   - localStorage `mybakuriani:banner_reach`: creatives this device has seen
 *     at least once (the reach flag, "unique users");
 *   - localStorage `mybakuriani:ad_frequency`: today's impressions per ad on
 *     this device (the media plan's frequency cap, §4).
 */
const SEEN_KEY: Record<BannerEvent, string> = {
  view: "mybakuriani:banner_views",
  open: "mybakuriani:banner_opens",
  click: "mybakuriani:banner_clicks",
};
const REACH_KEY = "mybakuriani:banner_reach";
const REACH_MAX = 300;
const FREQUENCY_KEY = "mybakuriani:ad_frequency";

/** ≥50% of the creative visible for this long before it counts as seen. */
const DWELL_MS = 1_000;
const VISIBILITY_RATIO = 0.5;
/** Events wait this long so one page's slots share one request. */
const FLUSH_DELAY_MS = 2_000;

// Fallbacks when storage is unavailable (private mode / blocked).
const seenInMemory = new Set<string>();
const reachInMemory = new Set<string>();
let frequencyInMemory: FrequencyStore = { day: "", counts: {} };

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

/** True the first time this device sees the creative (the reach flag). */
function markReached(creativeId: string): boolean {
  if (reachInMemory.has(creativeId)) return false;
  reachInMemory.add(creativeId);
  try {
    const raw = window.localStorage.getItem(REACH_KEY);
    const seen = raw ? (JSON.parse(raw) as string[]) : [];
    if (seen.includes(creativeId)) return false;
    window.localStorage.setItem(
      REACH_KEY,
      JSON.stringify([...seen, creativeId].slice(-REACH_MAX)),
    );
    return true;
  } catch {
    // No storage: this page load is the only memory we have.
    return true;
  }
}

type FrequencyStore = { day: string; counts: Record<string, number> };

function tbilisiDay(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tbilisi" }).format(
    new Date(),
  );
}

function readFrequency(): FrequencyStore {
  const day = tbilisiDay();
  try {
    const raw = window.localStorage.getItem(FREQUENCY_KEY);
    const parsed = raw ? (JSON.parse(raw) as FrequencyStore) : null;
    if (parsed && parsed.day === day && parsed.counts) return parsed;
    return { day, counts: {} };
  } catch {
    return frequencyInMemory.day === day
      ? frequencyInMemory
      : { day, counts: {} };
  }
}

function bumpFrequency(creativeId: string): void {
  const store = readFrequency();
  store.counts[creativeId] = (store.counts[creativeId] ?? 0) + 1;
  frequencyInMemory = store;
  try {
    window.localStorage.setItem(FREQUENCY_KEY, JSON.stringify(store));
  } catch {
    // in-memory copy above still caps this page load
  }
}

/**
 * Ads this device already saw `frequencyCap` times today (§4: "ერთი რეკლამის
 * frequency cap — 3 ჩვენება/დღე"). Keys are creative ids (`ad:<uuid>`).
 */
export function cappedCreativeIds(
  creatives: readonly { id: string; frequencyCap?: number | null }[],
): Set<string> {
  const capped = new Set<string>();
  if (typeof window === "undefined") return capped;
  const { counts } = readFrequency();
  for (const creative of creatives) {
    const cap = creative.frequencyCap;
    if (cap != null && cap > 0 && (counts[creative.id] ?? 0) >= cap) {
      capped.add(creative.id);
    }
  }
  return capped;
}

/* ------------------------------------------------------------ the beacon */

type QueuedEvent =
  | {
      t: "imp";
      source: BannerCreative["source"];
      id: string;
      s?: 1;
      r?: 1;
      slot?: 1;
    }
  | { t: "open" | "click"; source: BannerCreative["source"]; id: string }
  | { t: "empty"; placement: string };

const queue: QueuedEvent[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;

function post(events: QueuedEvent[]): void {
  const body = JSON.stringify({ events });
  try {
    if (typeof navigator !== "undefined" && navigator.sendBeacon) {
      const queued = navigator.sendBeacon(
        "/api/banner-slots/track",
        new Blob([body], { type: "application/json" }),
      );
      if (queued) return;
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

function flush(): void {
  if (flushTimer !== null) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  while (queue.length > 0) post(queue.splice(0, BANNER_BATCH_MAX));
}

function enqueue(event: QueuedEvent, immediate = false): void {
  queue.push(event);
  if (immediate || queue.length >= BANNER_BATCH_MAX) flush();
  else if (flushTimer === null) flushTimer = setTimeout(flush, FLUSH_DELAY_MS);
}

// A page that closes or goes to the background sends what it has.
if (typeof window !== "undefined") {
  window.addEventListener("pagehide", flush);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flush();
  });
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
  // A click usually leaves the page (or opens a tab): send it now.
  enqueue(
    { t: event, source: creative.source, id: creative.sourceId },
    event === "click",
  );
}

/* --------------------------------------------------------------- viewable */

/**
 * Calls `onViewable` once the node has been at least half on screen for
 * DWELL_MS, once per `key` (a new key — a new creative or a sidebar refresh —
 * arms it again). Inert when `enabled` is false.
 */
function useViewable(
  enabled: boolean,
  key: string,
  onViewable: () => void,
): (node: HTMLElement | null) => void {
  const nodeRef = useRef<HTMLElement | null>(null);
  const firedKeyRef = useRef<string | null>(null);
  const callbackRef = useRef(onViewable);

  useEffect(() => {
    callbackRef.current = onViewable;
  });

  useEffect(() => {
    if (!enabled) return;
    const node = nodeRef.current;
    if (!node || typeof IntersectionObserver === "undefined") return;
    if (firedKeyRef.current === key) return;

    let timer: ReturnType<typeof setTimeout> | null = null;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            if (timer === null) {
              timer = setTimeout(() => {
                if (firedKeyRef.current === key) return;
                firedKeyRef.current = key;
                observer.disconnect();
                callbackRef.current();
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
  }, [enabled, key]);

  return useCallback((node: HTMLElement | null) => {
    nodeRef.current = node;
  }, []);
}

export type ImpressionOptions = {
  /** Changes on every new display of the slot (a re-pick), re-arming it. */
  displayKey?: string | number;
  /** This creative fills the placement's ad position (actual-SOV denominator). */
  slot?: boolean;
};

/**
 * Returns a ref for the creative's root element; an impression is counted once
 * it has been at least half on screen for DWELL_MS, once per display. Inert
 * when `enabled` is false (the admin preview must never inflate live numbers).
 */
export function useBannerViewTracking(
  creative: BannerCreative,
  enabled: boolean,
  { displayKey = 0, slot = false }: ImpressionOptions = {},
): (node: HTMLElement | null) => void {
  // Primitives, not the object: the store hands out a fresh object on every
  // refresh, which must not restart the dwell timer.
  const { id: creativeId, source, sourceId, sponsored } = creative;

  return useViewable(enabled, `${creativeId}|${displayKey}`, () => {
    const firstInSession = !alreadyCounted("view", creativeId);
    if (firstInSession) markCounted("view", creativeId);
    const firstOnDevice = markReached(creativeId);
    if (sponsored) bumpFrequency(creativeId);
    enqueue({
      t: "imp",
      source,
      id: sourceId,
      ...(firstInSession ? { s: 1 as const } : {}),
      ...(firstOnDevice ? { r: 1 as const } : {}),
      ...(slot ? { slot: 1 as const } : {}),
    });
  });
}

/**
 * Ref for a 1-px marker left where a slot's ad position would be when nothing
 * was drawn into it: once seen, it counts toward the placement's ad-position
 * displays (the denominator of planned vs actual SOV), never as an impression.
 */
export function useEmptySlotTracking(
  placement: string,
  enabled: boolean,
  displayKey: string | number = 0,
): (node: HTMLElement | null) => void {
  return useViewable(enabled, `empty|${placement}|${displayKey}`, () => {
    enqueue({ t: "empty", placement });
  });
}
