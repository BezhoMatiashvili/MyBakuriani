import "server-only";
import { cache } from "react";
import { timeoutFetch } from "@/lib/with-timeout";
import type {
  LocalizedText,
  StatusCard,
  StatusCardItem,
} from "@/lib/status-cards/types";

// Live Tbilisi -> Bakuriani drive estimate for the landing "road" status card.
// Mirrors src/lib/weather/server.ts: one keyless server-side provider fetch behind
// cache() + next:{revalidate}. Live data wins for the value/detail, while the card's
// presence, label, icon and redDot stay admin-editable, and any failure returns null
// so the admin value shows through instead of a blank card.
//
// This replaced the paid Google Routes API, which is why the value used to be staged
// through a table + pg_cron + an edge function. OSRM is free and keyless, so that
// apparatus was retired (20260725160000_retire_road_conditions.sql).
//
// FREE-FLOW ONLY: OSRM answers with weight_name "routability" — there is no traffic
// model and no closure feed. The card's "თავისუფალი" is a fixed label, NOT a
// measurement; the ETA and distance carry the real information, and the dropdown says
// so. Do not reintroduce a clear/moderate/heavy classifier without a provider that
// actually reports traffic, and do not let anything imply congestion was observed. A
// genuinely closed road cannot be detected here — the admin-set redDot is that channel.
//
// FOSSGIS terms: <=1 req/s, a User-Agent that identifies the application (library
// defaults are explicitly rejected), a Referer where possible, and visible ODbL
// attribution plus a fix-the-map link — rendered in src/components/layout/Footer.tsx.
// Keep the two in sync: dropping that Footer credit puts us out of compliance.

const ROAD_CARD_ID = "road";

// Coordinates are lon,lat in the PATH — the reverse of the lat/lng order the Google
// Routes body used. Pre-joined so the pair cannot be transposed at a call site.
const OSRM_URL =
  "https://routing.openstreetmap.de/routed-car/route/v1/driving/" +
  "44.8271,41.7151;43.5386,41.7497" + // Tbilisi centre -> Bakuriani centre
  "?overview=false&alternatives=false&steps=false";

// Same identification the Nominatim proxy sends (src/app/api/geocode/route.ts).
// Verify the production domain here before shipping if it changes.
const REQUEST_HEADERS = {
  "User-Agent":
    "MyBakuriani/1.0 (https://my-bakuriani.vercel.app; beji.matiashvili@gmail.com)",
  Referer: "https://my-bakuriani.vercel.app",
  Accept: "application/json",
};

export const ROAD_REVALIDATE_SECONDS = 30 * 60;
const ROAD_FETCH_TIMEOUT_MS = 5000;

// Absurdity bounds, NOT plausibility bounds. The measured baseline is 9856 s /
// 185 252 m; a real detour may well double it and we WANT to show that. These only
// reject a degenerate route (bad snap, truncated leg) — OSRM returns code:"Ok" with
// nonsense durations in those cases, so "Ok" is not a plausibility signal on its own.
const MIN_DURATION_SECONDS = 60 * 60;
const MAX_DURATION_SECONDS = 8 * 60 * 60;
const MIN_DISTANCE_METERS = 100_000;
const MAX_DISTANCE_METERS = 500_000;

export type RoadCondition = {
  durationSeconds: number;
  distanceMeters: number;
};

type OsrmRouteResponse = {
  code?: string;
  routes?: Array<{ duration?: number; distance?: number }>;
};

function inRange(value: unknown, min: number, max: number): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= min &&
    value <= max
  );
}

// OSRM returns plain finite numbers (Google used "13200s" protobuf strings — nothing
// to parse here). Every field is checked before the payload is trusted, same rigor as
// parseWeatherApiWeather.
function parseOsrmRoute(
  payload: OsrmRouteResponse | null,
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
  return {
    durationSeconds: route.duration,
    distanceMeters: route.distance,
  };
}

// Fetches the current routed drive time. Returns null on any error (network, timeout,
// bad shape, degenerate route) so the caller falls back to the existing card value
// instead of rendering blank. cache() dedupes within a single render; the fetch's
// revalidate window is what keeps us to ~2 upstream requests an hour.
export const getRoadCondition = cache(
  async (): Promise<RoadCondition | null> => {
    try {
      const res = await timeoutFetch(ROAD_FETCH_TIMEOUT_MS)(OSRM_URL, {
        headers: REQUEST_HEADERS,
        next: { revalidate: ROAD_REVALIDATE_SECONDS },
      });

      // Both checks are needed: OSRM reports some failures as HTTP 200 with a
      // non-"Ok" code, and others as a 4xx with a JSON body. parseOsrmRoute covers
      // the code; !res.ok covers the rest.
      if (!res.ok) return null;

      const payload = (await res
        .json()
        .catch(() => null)) as OsrmRouteResponse | null;

      return parseOsrmRoute(payload);
    } catch {
      return null;
    }
  },
);

// Fixed label. Not a measurement — see the free-flow note at the top of this file.
const ROAD_CLEAR_LABEL: LocalizedText = {
  ka: "თავისუფალი",
  en: "Clear",
  ru: "Свободна",
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

function buildItems(condition: RoadCondition): StatusCardItem[] {
  return [
    {
      // No status dot. A green one here would re-assert the "all clear" verdict the
      // deleted classifier used to make — the same unmeasured claim, rendered as a
      // colour instead of a word, directly above a row saying traffic is excluded.
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
    // The honesty row. The headline reads "თავისუფალი", which is a traffic word, but
    // the estimate has no traffic input at all. Deliberately NOT "საცობების გარეშე"
    // ("without traffic jams") — that would assert the very thing we cannot observe.
    // The label/value split says traffic is excluded from the estimate, not absent
    // from the road.
    {
      id: "road-traffic",
      label: { ka: "ტრაფიკი", en: "Traffic", ru: "Пробки" },
      value: {
        ka: "არ არის გათვალისწინებული",
        en: "Not accounted for",
        ru: "Не учитываются",
      },
      status: "none",
      url: null,
    },
  ];
}

// Overrides the road card's value/detail with the live route. No-op when the route is
// unavailable (null), so the admin-editable default value shows through. Deliberately
// does NOT write redDot: that is admin-controlled and is the only channel for flagging
// a real closure, which this data source cannot detect.
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
          value: ROAD_CLEAR_LABEL,
          expandable: true,
          items,
        }
      : card,
  );
}
