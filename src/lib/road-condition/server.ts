import "server-only";
import { cache } from "react";
import { timeoutFetch } from "@/lib/with-timeout";
import type {
  LocalizedText,
  StatusCard,
  StatusCardItem,
  StatusKind,
} from "@/lib/status-cards/types";

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
// of a guess. See memory-bank/contracts.md C4 for the history of this module.
//
// A genuinely closed road still cannot be detected here (Mapbox has no closure
// feed for this corridor) — the admin-set redDot remains the only channel for that.

const ROAD_CARD_ID = "road";

// Coordinates are lon,lat — Mapbox uses the same order OSRM did. Pre-joined so the
// pair cannot be transposed at a call site.
const MAPBOX_COORDS = "44.8271,41.7151;43.5386,41.7497"; // Tbilisi centre -> Bakuriani centre

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

// duration / duration_typical thresholds for classifying live traffic. Below the
// first line is normal variance (Mapbox's own live estimate wobbles a few percent
// run to run); above the second is a real, noticeable slowdown.
const MODERATE_RATIO = 1.12;
const HEAVY_RATIO = 1.35;

export type RoadTrafficStatus = "clear" | "moderate" | "heavy" | "unknown";

export type RoadCondition = {
  durationSeconds: number;
  distanceMeters: number;
  durationTypicalSeconds: number | null;
  trafficStatus: RoadTrafficStatus;
};

type MapboxRoute = {
  distance?: number;
  duration?: number;
  duration_typical?: number;
};

type MapboxDirectionsResponse = {
  code?: string;
  routes?: MapboxRoute[];
};

function inRange(value: unknown, min: number, max: number): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= min &&
    value <= max
  );
}

function classifyTraffic(
  durationSeconds: number,
  durationTypicalSeconds: number | null,
): RoadTrafficStatus {
  if (!durationTypicalSeconds || durationTypicalSeconds <= 0) return "unknown";
  const ratio = durationSeconds / durationTypicalSeconds;
  if (ratio >= HEAVY_RATIO) return "heavy";
  if (ratio >= MODERATE_RATIO) return "moderate";
  return "clear";
}

// Every field is checked before the payload is trusted, same rigor as
// parseWeatherApiWeather. `duration_typical` is optional in Mapbox's response (it's
// only populated when the corridor has enough historical traffic data) — its
// absence degrades traffic status to "unknown" rather than failing the whole card.
function parseMapboxRoute(
  payload: MapboxDirectionsResponse | null,
): RoadCondition | null {
  if (!payload || payload.code !== "Ok") return null;
  const route = payload.routes?.[0];
  if (!route) return null;
  if (!inRange(route.duration, MIN_DURATION_SECONDS, MAX_DURATION_SECONDS)) {
    return null;
  }
  if (!inRange(route.distance, MIN_DISTANCE_METERS, MAX_DISTANCE_METERS)) {
    return null;
  }
  const durationTypicalSeconds = inRange(
    route.duration_typical,
    MIN_DURATION_SECONDS,
    MAX_DURATION_SECONDS,
  )
    ? route.duration_typical
    : null;
  return {
    durationSeconds: route.duration,
    distanceMeters: route.distance,
    durationTypicalSeconds,
    trafficStatus: classifyTraffic(route.duration, durationTypicalSeconds),
  };
}

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

      return parseMapboxRoute(payload);
    } catch {
      return null;
    }
  },
);

const ROAD_STATUS_LABEL: Record<RoadTrafficStatus, LocalizedText> = {
  clear: { ka: "თავისუფალი", en: "Clear", ru: "Свободна" },
  moderate: {
    ka: "საშუალო დატვირთვა",
    en: "Moderate traffic",
    ru: "Умеренное движение",
  },
  heavy: { ka: "დატვირთული", en: "Heavy traffic", ru: "Пробки" },
  // Kept for the rare case Mapbox omits duration_typical for this corridor — same
  // honest fallback the old free-flow-only card used.
  unknown: { ka: "თავისუფალი", en: "Clear", ru: "Свободна" },
};

const ROAD_STATUS_DOT: Record<RoadTrafficStatus, StatusKind> = {
  clear: "ok",
  moderate: "warn",
  heavy: "warn",
  unknown: "none",
};

// Live duration -> "~3სთ 40წთ" (tilde signals an estimate).
function formatDuration(seconds: number): LocalizedText {
  const totalMin = Math.round(seconds / 60);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  const build = (hu: string, mu: string): string =>
    h > 0 ? `~${h}${hu} ${m}${mu}` : `~${m}${mu}`;
  return {
    ka: build("სთ", "წთ"),
    en: build("h", "m"),
    ru: build("ч", "м"),
  };
}

// Distance in metres -> whole kilometres: "185 კმ".
function formatDistance(meters: number): LocalizedText {
  const km = Math.round(meters / 1000);
  return { ka: `${km} კმ`, en: `${km} km`, ru: `${km} км` };
}

// duration vs duration_typical -> "ჩვეულებრივზე +18 წთ" / "ჩვეულებრივი" — the real
// traffic reading, replacing the old fixed "not accounted for" row.
function formatTrafficDetail(condition: RoadCondition): LocalizedText {
  if (
    condition.trafficStatus === "unknown" ||
    !condition.durationTypicalSeconds
  ) {
    return {
      ka: "არ არის ხელმისაწვდომი",
      en: "Not available",
      ru: "Недоступно",
    };
  }
  const deltaMin = Math.round(
    (condition.durationSeconds - condition.durationTypicalSeconds) / 60,
  );
  if (deltaMin <= 2) {
    return { ka: "ჩვეულებრივი", en: "Normal", ru: "Обычное" };
  }
  return {
    ka: `ჩვეულებრივზე +${deltaMin} წთ`,
    en: `+${deltaMin} min vs. usual`,
    ru: `+${deltaMin} мин к обычному`,
  };
}

function buildItems(condition: RoadCondition): StatusCardItem[] {
  return [
    {
      id: "road-eta",
      label: { ka: "დრო", en: "Time", ru: "Время" },
      value: formatDuration(condition.durationSeconds),
      status: "none",
      url: null,
    },
    {
      id: "road-distance",
      label: { ka: "მანძილი", en: "Distance", ru: "Расстояние" },
      value: formatDistance(condition.distanceMeters),
      status: "none",
      url: null,
    },
    {
      id: "road-traffic",
      label: { ka: "ტრაფიკი", en: "Traffic", ru: "Пробки" },
      value: formatTrafficDetail(condition),
      status: ROAD_STATUS_DOT[condition.trafficStatus],
      url: null,
    },
  ];
}

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
  const items = buildItems(condition);
  return cards.map((card) =>
    card.id === ROAD_CARD_ID
      ? {
          ...card,
          value: ROAD_STATUS_LABEL[condition.trafficStatus],
          expandable: true,
          items,
        }
      : card,
  );
}
