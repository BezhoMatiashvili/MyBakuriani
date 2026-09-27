import "server-only";
import { cache } from "react";
import { timeoutFetch } from "@/lib/with-timeout";
import type { StatusCard } from "@/lib/status-cards/types";
import {
  BAKURIANI_DESTINATION,
  buildRoadConditionItems,
  formatDuration,
  parseMapboxRoute,
  ROAD_CARD_ID,
  ROAD_STATUS_LABEL,
  TBILISI_ORIGIN,
  type MapboxDirectionsResponse,
  type RoadCondition,
} from "@/lib/road-condition/shared";

// Live Tbilisi -> Bakuriani drive estimate + real traffic status for the landing
// "road" status card. Mirrors src/lib/weather/server.ts: one server-side provider
// fetch behind cache() + next:{revalidate}. Live data wins for the value/detail,
// while the card's presence, label, icon and redDot stay admin-editable, and any
// failure returns null so the admin value shows through instead of a blank card.
//
// Provider: Mapbox Directions API, `mapbox/driving-traffic` profile (same provider
// as the Lux project, MAPBOX_ACCESS_TOKEN). This superseded the free-flow-only
// FOSSGIS OSRM fetch (routing.openstreetmap.de) that ran here before — OSRM's
// weight_name is "routability" with no traffic model at all, so the old card could
// only ever show a fixed "თავისუფალი" label next to an honest "ტრაფიკი: არ არის
// გათვალისწინებული" row. Mapbox's driving-traffic profile returns BOTH a live
// `duration` (current conditions) and a `duration_typical` (historical baseline) on
// the same route — comparing the two gives a real, measured traffic signal instead
// of a guess. See docs/contracts.md C4 for the history of this module.
//
// A genuinely closed road still cannot be detected here (Mapbox has no closure
// feed for this corridor) — the admin-set redDot remains the only channel for that.

// Mapbox coordinates are lon,lat (shared.ts's LatLng constants are lat,lng -
// flipped once here rather than at every call site).
const MAPBOX_COORDS = `${TBILISI_ORIGIN.lng},${TBILISI_ORIGIN.lat};${BAKURIANI_DESTINATION.lng},${BAKURIANI_DESTINATION.lat}`;

const MAPBOX_DIRECTIONS_URL =
  `https://api.mapbox.com/directions/v5/mapbox/driving-traffic/${MAPBOX_COORDS}` +
  "?overview=false&alternatives=false&steps=false";

export const ROAD_REVALIDATE_SECONDS = 10 * 60;
const ROAD_FETCH_TIMEOUT_MS = 5000;

// Absurdity bounds, NOT plausibility bounds. The measured baseline is ~11 000 s /
// 186 300 m; a real detour or heavy traffic may well push duration well past that
// and we WANT to show it. These only reject a degenerate route (bad snap, truncated
// leg) — Mapbox returns code:"Ok" with nonsense durations in those cases, so "Ok" is
// not a plausibility signal on its own.
const MIN_DURATION_SECONDS = 60 * 60;
const MAX_DURATION_SECONDS = 8 * 60 * 60;
const MIN_DISTANCE_METERS = 100_000;
const MAX_DISTANCE_METERS = 500_000;
const BOUNDS = {
  minDurationSeconds: MIN_DURATION_SECONDS,
  maxDurationSeconds: MAX_DURATION_SECONDS,
  minDistanceMeters: MIN_DISTANCE_METERS,
  maxDistanceMeters: MAX_DISTANCE_METERS,
};

// Fetches the current live-traffic drive time. Returns null on any error (missing
// token, network, timeout, bad shape, degenerate route) so the caller falls back to
// the existing card value instead of rendering blank. cache() dedupes within a
// single render; the fetch's revalidate window is what keeps upstream request volume
// low (~6/hour — still trivial against Mapbox's Directions API quota).
export const getRoadCondition = cache(
  async (): Promise<RoadCondition | null> => {
    const token = process.env.MAPBOX_ACCESS_TOKEN;
    if (!token) return null;

    try {
      const url = `${MAPBOX_DIRECTIONS_URL}&access_token=${token}`;
      const res = await timeoutFetch(ROAD_FETCH_TIMEOUT_MS)(url, {
        next: { revalidate: ROAD_REVALIDATE_SECONDS },
      });

      // Both checks are needed: Mapbox reports some failures as HTTP 200 with a
      // non-"Ok" code, and others as a 4xx/401 with a JSON body. parseMapboxRoute
      // covers the code; !res.ok covers the rest.
      if (!res.ok) return null;

      const payload = (await res
        .json()
        .catch(() => null)) as MapboxDirectionsResponse | null;

      return parseMapboxRoute(payload, BOUNDS);
    } catch {
      return null;
    }
  },
);

// Overrides the road card's value/detail with the live route + real traffic status.
// No-op when the route is unavailable (null), so the admin-editable default value
// shows through. Deliberately does NOT write redDot: that is admin-controlled and
// is the only channel for flagging a real closure, which this data source cannot
// detect.
export function withLiveRoad(
  cards: StatusCard[],
  condition: RoadCondition | null,
): StatusCard[] {
  if (!condition) return cards;
  const items = buildRoadConditionItems(condition);
  return cards.map((card) =>
    card.id === ROAD_CARD_ID
      ? {
          ...card,
          value: ROAD_STATUS_LABEL[condition.trafficStatus],
          subValue: formatDuration(condition.durationSeconds),
          expandable: true,
          items,
        }
      : card,
  );
}
