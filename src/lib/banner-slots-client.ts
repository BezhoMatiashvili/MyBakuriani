"use client";

import { useEffect, useId, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import type { BannerCreative } from "@/lib/banner-creative";
import type { BannerPlacement } from "@/lib/banner-placements";
import {
  MOBILE_MAX_AD_PLACEMENTS,
  MOBILE_MAX_WIDTH_PX,
  PHONE_ONLY_PLACEMENTS,
  SIDEBAR_REFRESH_MS,
  isDeterministic,
  pickAd,
  pickHouse,
  rotationModeFor,
  stackSlot,
  type RotationCandidate,
} from "@/lib/ad-rotation";
import { cappedCreativeIds } from "@/lib/banner-tracking";

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

/* ---------------------------------------------------- rotation (C47) */

/**
 * The fields the draw reads. An ad without them (a cached pre-C47 response)
 * is drawn as the old renderer showed it: the whole slot, no cap.
 */
type Rotatable = Pick<BannerCreative, "id" | "sponsored"> & {
  sovPercent?: number | null;
  priority?: number | null;
  frequencyCap?: number | null;
};

type Candidate<T> = RotationCandidate & { creative: T };

function toCandidate<T extends Rotatable>(creative: T): Candidate<T> {
  return {
    id: creative.id,
    sponsored: creative.sponsored,
    sovPercent: creative.sponsored ? (creative.sovPercent ?? 100) : 0,
    priority: creative.priority ?? 0,
    frequencyCap: creative.sponsored ? (creative.frequencyCap ?? null) : null,
    creative,
  };
}

function isPhone(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia(`(max-width: ${MOBILE_MAX_WIDTH_PX}px)`).matches
  );
}

/**
 * §4 "Mobile: at most 2 paid placements in one screen flow": on a phone, the
 * placements currently showing a paid ad. A placement holds its claim while
 * any of its instances (the two grid cards) shows an ad.
 */
const phoneAdClaims = new Map<string, Set<string>>();

function claimPhoneAdPlacement(placement: string, instance: string): boolean {
  if (!isPhone()) return true;
  const holders = phoneAdClaims.get(placement);
  if (holders) {
    holders.add(instance);
    return true;
  }
  if (phoneAdClaims.size >= MOBILE_MAX_AD_PLACEMENTS) return false;
  phoneAdClaims.set(placement, new Set([instance]));
  return true;
}

function releasePhoneAdPlacement(placement: string, instance: string): void {
  const holders = phoneAdClaims.get(placement);
  if (!holders) return;
  holders.delete(instance);
  if (holders.size === 0) phoneAdClaims.delete(placement);
}

/** What each mounted instance of a placement shows, so grid cards never repeat. */
const shownByPlacement = new Map<string, Map<string, string>>();

function othersShown(placement: string, instance: string): Set<string> {
  const shown = shownByPlacement.get(placement);
  if (!shown) return new Set();
  return new Set(
    [...shown].filter(([key]) => key !== instance).map(([, id]) => id),
  );
}

function setShown(placement: string, instance: string, id: string | null) {
  let shown = shownByPlacement.get(placement);
  if (!shown) {
    shown = new Map();
    shownByPlacement.set(placement, shown);
  }
  if (id) shown.set(instance, id);
  else shown.delete(instance);
}

export type SlotDisplay<T> = {
  /** Creatives to draw: one (or none) for single styles; house + ≤1 ad stacked. */
  shown: T[];
  /** Changes on every new display (page view, re-draw), re-arming impressions. */
  displayKey: string;
  /** The creative in the placement's ad position (counted with slot=1). */
  slotCreativeId: string | null;
  /** The placement sells ads but this draw left its ad position empty. */
  emptyAdPosition: boolean;
};

type Draw<T> = Omit<SlotDisplay<T>, "displayKey">;

const NOTHING = { shown: [], slotCreativeId: null, emptyAdPosition: false };

/** Editorial banners only, in server order: the server render and fallback. */
function houseDraw<T extends Rotatable>(
  creatives: readonly T[],
  single: boolean,
  position: number,
): Draw<T> {
  const house = creatives.filter((c) => !c.sponsored);
  if (!single)
    return { shown: house, slotCreativeId: null, emptyAdPosition: false };
  const pick = house[position] ?? null;
  return {
    shown: pick ? [pick] : [],
    slotCreativeId: pick?.id ?? null,
    emptyAdPosition: false,
  };
}

/**
 * Which of a placement's creatives this page view shows (the media plan, C47):
 * one SOV draw per page view after mount (never during render: the landing
 * page is ISR and /api/banner-slots is one CDN entry, so a server-side draw
 * would show every visitor the same ad), house fill for the unsold share,
 * distinct creatives on the grid's two positions, at most two paid placements
 * on a phone, the phone-only strip only on phones, and a re-draw of the
 * 320×400 sidebar every 45 s while the tab is visible.
 *
 * Until the draw a slot shows only its editorial banners (what the server
 * rendered), so hydration matches and a slot with house fill never jumps.
 */
export function useSlotRotation<T extends Rotatable>(
  placement: string,
  creatives: readonly T[],
  {
    single,
    interactive,
    position = 0,
    refresh = false,
  }: {
    single: boolean;
    interactive: boolean;
    /** Grid card index on the page (0, 1). */
    position?: number;
    /** Re-draw every SIDEBAR_REFRESH_MS (the 320×400 sidebar). */
    refresh?: boolean;
  },
): SlotDisplay<T> {
  const instance = useId();
  const pathname = usePathname() ?? "";
  const phoneOnly = PHONE_ONLY_PLACEMENTS.includes(placement);
  const deterministic = isDeterministic(creatives.map(toCandidate));

  const [draw, setDraw] = useState<Draw<T> | null>(null);
  const [drawCount, setDrawCount] = useState(0);
  // Bumped by the sidebar timer to ask for a fresh draw.
  const [tick, setTick] = useState(0);
  const lastShownRef = useRef<string | null>(null);

  // The creatives' identity, so a fresh store array with the same rows does
  // not re-draw (that would reshuffle the slot on every store refresh).
  const signature = creatives
    .map(
      (c) =>
        `${c.id}:${c.sovPercent ?? ""}:${c.priority ?? ""}:${c.frequencyCap ?? ""}`,
    )
    .join("|");

  useEffect(() => {
    if (!interactive) return;

    let next: Draw<T> | null;
    if (phoneOnly && !isPhone()) {
      next = NOTHING;
    } else if (deterministic) {
      // Nothing to draw. The phone-only strip still waited for the check.
      next = phoneOnly ? houseDraw(creatives, single, position) : null;
    } else {
      const candidates = creatives.map(toCandidate);
      const mode = rotationModeFor(placement);
      const exclude = othersShown(placement, instance);
      const capped = cappedCreativeIds(creatives);
      let ad = pickAd(candidates, mode, {
        random: Math.random(),
        capped,
        exclude,
      });
      // A phone page that already shows two paid placements gets house fill.
      if (ad && !claimPhoneAdPlacement(placement, instance)) ad = null;
      if (!ad) releasePhoneAdPlacement(placement, instance);

      if (single) {
        const pick = ad ?? pickHouse(candidates, exclude);
        next = {
          shown: pick ? [pick.creative] : [],
          slotCreativeId: pick?.id ?? null,
          emptyAdPosition: !pick,
        };
      } else {
        next = {
          shown: stackSlot(candidates, ad).map((entry) => entry.creative),
          slotCreativeId: ad?.id ?? null,
          emptyAdPosition: !ad,
        };
      }
      setShown(placement, instance, next.slotCreativeId);
    }

    // A re-draw that lands on the same creatives keeps the display (no second
    // impression for a sidebar refresh that drew the same ad again).
    const shownKey = next
      ? `${next.shown.map((c) => c.id).join(",")}|${next.emptyAdPosition}`
      : "server";
    if (shownKey !== lastShownRef.current) {
      lastShownRef.current = shownKey;
      setDraw(next);
      setDrawCount((count) => count + 1);
    }

    return () => {
      releasePhoneAdPlacement(placement, instance);
      setShown(placement, instance, null);
    };
    // `signature` stands in for `creatives`; `pathname` re-draws the layout's
    // slots on every page view; `tick` is the sidebar refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    signature,
    pathname,
    tick,
    interactive,
    single,
    placement,
    position,
    instance,
  ]);

  useEffect(() => {
    if (!refresh || !interactive || deterministic || creatives.length === 0) {
      return;
    }
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") setTick((n) => n + 1);
    }, SIDEBAR_REFRESH_MS);
    return () => clearInterval(timer);
  }, [refresh, interactive, deterministic, creatives.length]);

  if (!interactive) {
    // Admin preview: exactly what it was handed.
    const shown = single ? creatives.slice(0, 1) : [...creatives];
    return {
      shown,
      displayKey: "preview",
      slotCreativeId: single ? (shown[0]?.id ?? null) : null,
      emptyAdPosition: false,
    };
  }

  // A new page view re-arms impressions even when the same creative stays.
  const displayKey = `${pathname}#${drawCount}`;
  if (phoneOnly && draw === null) return { ...NOTHING, displayKey };
  return { ...(draw ?? houseDraw(creatives, single, position)), displayKey };
}
