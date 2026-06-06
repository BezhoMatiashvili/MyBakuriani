// Shared, pure matching logic for Smart Match. No React / Supabase imports so it
// can be used identically by the renter inbox (visibility + ranking) and the
// guest dashboard (notification targeting), guaranteeing the two never drift.
//
// The core fix this module exists for: most rental properties in production have
// NULL or garbage coordinates, so coordinate-only zone matching silently hid every
// zone-specific request from coord-less renters. Here we resolve a zone from the
// listing's location TEXT first (with coords as a sanity-guarded fallback) and
// FAIL OPEN — a property whose zone can't be resolved acts as a wildcard.

import { resolveZone, type Zone } from "@/lib/zones/types";

// Bakuriani sits around 41.7°N, 43.5°E. Coordinates outside this box (e.g. the
// real "12.0, 0.0" garbage row) are ignored so they can't force a wrong zone.
const BAKURIANI_BBOX = {
  latMin: 41.6,
  latMax: 41.9,
  lngMin: 43.4,
  lngMax: 43.7,
} as const;

function coordsAreSane(lat: number | null, lng: number | null): boolean {
  return (
    lat != null &&
    lng != null &&
    lat >= BAKURIANI_BBOX.latMin &&
    lat <= BAKURIANI_BBOX.latMax &&
    lng >= BAKURIANI_BBOX.lngMin &&
    lng <= BAKURIANI_BBOX.lngMax
  );
}

/**
 * Resolve a property's zone name (Zone.name_ka) from its free-text location and
 * coordinates. Coordinates are only trusted when inside the Bakuriani bounding
 * box; otherwise we rely on the location text. Returns null when the zone can't
 * be determined (treated as a wildcard by isCompatible).
 */
export function resolvePropertyZoneName(
  zones: Zone[],
  location: string | null | undefined,
  lat: number | null | undefined,
  lng: number | null | undefined,
): string | null {
  const safeLat = lat ?? null;
  const safeLng = lng ?? null;
  const useCoords = coordsAreSane(safeLat, safeLng);
  return (
    resolveZone(
      zones,
      location,
      useCoords ? safeLat : null,
      useCoords ? safeLng : null,
    )?.name_ka ?? null
  );
}

export interface MatchProperty {
  id: string;
  /** Resolved Zone.name_ka, or null when unknown (acts as a wildcard). */
  zoneName: string | null;
  /** price_per_night */
  price: number;
  capacity: number | null;
}

export interface MatchRequest {
  /** Zone.name_ka the guest targeted, or null for "all zones". */
  zone: string | null;
  budgetMin: number | null;
  budgetMax: number | null;
  guestsCount: number | null;
  checkIn: string | null;
  checkOut: string | null;
}

/**
 * Fail-open visibility rule. A request is shown to / notifies a renter when:
 *  - the request targets all zones (zone == null), OR
 *  - any of the renter's properties is in the requested zone, OR
 *  - any of the renter's properties has an unknown zone (wildcard).
 * It is only hidden when the renter HAS properties and every one resolves to a
 * known zone different from the request's zone.
 */
export function isCompatible(
  req: Pick<MatchRequest, "zone">,
  props: MatchProperty[],
): boolean {
  if (!req.zone) return true;
  if (props.length === 0) return true;
  return props.some((p) => p.zoneName === null || p.zoneName === req.zone);
}

export interface ScoreResult {
  /** 0–100, best-fitting property. Used for ranking + the match badge. */
  matchPercent: number;
  bestPropertyId: string | null;
  /** When the client's budget is below the renter's cheapest property. */
  belowOwnerPrice?: number;
  /** When the best property can't fit the requested party size. */
  capacityShort?: boolean;
}

const ZONE_WEIGHT = 40;
const BUDGET_WEIGHT = 30;
const CAPACITY_WEIGHT = 20;
const TOTAL_WEIGHT = ZONE_WEIGHT + BUDGET_WEIGHT + CAPACITY_WEIGHT; // 90 → normalize to 100

function zoneScore(req: MatchRequest, p: MatchProperty): number {
  if (!req.zone) return ZONE_WEIGHT; // all-zones request
  if (p.zoneName === req.zone) return ZONE_WEIGHT;
  if (p.zoneName === null) return ZONE_WEIGHT * 0.6; // unknown — partial credit
  return 0; // known, different zone
}

function budgetScore(req: MatchRequest, p: MatchProperty): number {
  const max = req.budgetMax;
  if (max == null || max <= 0) return BUDGET_WEIGHT; // no upper constraint
  if (p.price <= max) return BUDGET_WEIGHT;
  // Over budget: linear penalty, floored at 0.
  return BUDGET_WEIGHT * Math.max(0, 1 - (p.price - max) / max);
}

function capacityScore(req: MatchRequest, p: MatchProperty): number {
  if (!req.guestsCount || req.guestsCount <= 0) return CAPACITY_WEIGHT;
  if (p.capacity == null) return CAPACITY_WEIGHT * 0.6; // unknown — partial credit
  return p.capacity >= req.guestsCount ? CAPACITY_WEIGHT : 0;
}

/**
 * Score a request against a renter's properties, returning the best-fitting
 * property's match percentage plus UI hints. Pure; no side effects.
 */
export function scoreRequest(
  req: MatchRequest,
  props: MatchProperty[],
): ScoreResult {
  if (props.length === 0) {
    return { matchPercent: 0, bestPropertyId: null };
  }

  let best: MatchProperty | null = null;
  let bestScore = -1;
  for (const p of props) {
    const score =
      zoneScore(req, p) + budgetScore(req, p) + capacityScore(req, p);
    if (score > bestScore) {
      bestScore = score;
      best = p;
    }
  }

  const minOwnerPrice = props.reduce(
    (min, p) => (min === 0 ? p.price : Math.min(min, p.price)),
    0,
  );
  const clientBudget = req.budgetMax ?? req.budgetMin ?? 0;
  const belowOwnerPrice =
    clientBudget > 0 && clientBudget < minOwnerPrice
      ? minOwnerPrice
      : undefined;

  const capacityShort =
    !!req.guestsCount &&
    best?.capacity != null &&
    best.capacity < req.guestsCount;

  return {
    matchPercent: Math.round((bestScore / TOTAL_WEIGHT) * 100),
    bestPropertyId: best?.id ?? null,
    belowOwnerPrice,
    capacityShort: capacityShort || undefined,
  };
}

/** A request is stale once its check-out date has passed (null dates never stale). */
export function isStale(
  req: Pick<MatchRequest, "checkOut">,
  todayISO: string,
): boolean {
  return !!req.checkOut && req.checkOut < todayISO;
}
