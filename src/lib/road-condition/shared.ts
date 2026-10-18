import type {
  LocalizedText,
  StatusCard,
  StatusCardItem,
  StatusKind,
} from "@/lib/status-cards/types";
import type { LatLng } from "@/lib/maps/directions";

// The road card's id in the admin-managed status_cards document (see
// src/lib/status-cards/types.ts). Both withLiveRoad (server.ts) and
// withPersonalizedRoad (below) key off this.
export const ROAD_CARD_ID = "road";

// The two fixed points every road-status surface routes between: server.ts's
// default card, personalized.ts's destination, and RoadRouteMap.tsx's
// fallback origin (when a visitor hasn't shared their location) all read
// from here instead of repeating the coordinates.
export const TBILISI_ORIGIN: LatLng = { lat: 41.7151, lng: 44.8271 };
export const BAKURIANI_DESTINATION: LatLng = { lat: 41.7497, lng: 43.5386 };

// Pure helpers shared by the fixed Tbilisi->Bakuriani road card
// (server.ts, server-only) and the personalized visitor-location card
// (personalized.ts, client-safe). Deliberately has NO `server-only` import so
// both sides can use it. Plausibility BOUNDS are not shared - server.ts's
// fixed-origin bounds (100km/1h minimums) would wrongly reject a visitor
// already near Bakuriani, so personalized.ts defines its own, looser bounds.

export type RoadTrafficStatus = "clear" | "moderate" | "heavy" | "unknown";

export type RoadCondition = {
  durationSeconds: number;
  distanceMeters: number;
  durationTypicalSeconds: number | null;
  trafficStatus: RoadTrafficStatus;
};

export type MapboxRoute = {
  distance?: number;
  duration?: number;
  duration_typical?: number;
};

export type MapboxDirectionsResponse = {
  code?: string;
  routes?: MapboxRoute[];
};

export function inRange(
  value: unknown,
  min: number,
  max: number,
): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= min &&
    value <= max
  );
}

// duration / duration_typical thresholds for classifying live traffic. Below
// the first line is normal variance (Mapbox's own live estimate wobbles a
// few percent run to run); above the second is a real, noticeable slowdown.
// Distance-independent, so shared as-is by both fixed and personalized cards.
const MODERATE_RATIO = 1.12;
const HEAVY_RATIO = 1.35;

export function classifyTraffic(
  durationSeconds: number,
  durationTypicalSeconds: number | null,
): RoadTrafficStatus {
  if (!durationTypicalSeconds || durationTypicalSeconds <= 0) return "unknown";
  const ratio = durationSeconds / durationTypicalSeconds;
  if (ratio >= HEAVY_RATIO) return "heavy";
  if (ratio >= MODERATE_RATIO) return "moderate";
  return "clear";
}

export interface RoadConditionBounds {
  minDurationSeconds: number;
  maxDurationSeconds: number;
  minDistanceMeters: number;
  maxDistanceMeters: number;
}

// Every field is checked before the payload is trusted. `duration_typical`
// is optional in Mapbox's response (only populated when the corridor has
// enough historical traffic data) - its absence degrades traffic status to
// "unknown" rather than failing the whole card.
export function parseMapboxRoute(
  payload: MapboxDirectionsResponse | null,
  bounds: RoadConditionBounds,
): RoadCondition | null {
  if (!payload || payload.code !== "Ok") return null;
  const route = payload.routes?.[0];
  if (!route) return null;
  if (
    !inRange(
      route.duration,
      bounds.minDurationSeconds,
      bounds.maxDurationSeconds,
    )
  ) {
    return null;
  }
  if (
    !inRange(route.distance, bounds.minDistanceMeters, bounds.maxDistanceMeters)
  ) {
    return null;
  }
  const durationTypicalSeconds = inRange(
    route.duration_typical,
    bounds.minDurationSeconds,
    bounds.maxDurationSeconds,
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

export const ROAD_STATUS_LABEL: Record<RoadTrafficStatus, LocalizedText> = {
  clear: { ka: "თავისუფალი", en: "Clear", ru: "Свободна" },
  moderate: {
    ka: "საშუალო დატვირთვა",
    en: "Moderate traffic",
    ru: "Умеренное движение",
  },
  heavy: { ka: "დატვირთული", en: "Heavy traffic", ru: "Пробки" },
  // Kept for the rare case Mapbox omits duration_typical for this corridor -
  // same honest fallback the old free-flow-only card used.
  unknown: { ka: "თავისუფალი", en: "Clear", ru: "Свободна" },
};

// Live duration -> "~3სთ 40წთ" (tilde signals an estimate).
export function formatDuration(seconds: number): LocalizedText {
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
export function formatDistance(meters: number): LocalizedText {
  const km = Math.round(meters / 1000);
  return { ka: `${km} კმ`, en: `${km} km`, ru: `${km} км` };
}

// duration vs duration_typical -> "ჩვეულებრივზე +18 წთ" / "ჩვეულებრივი" - the
// real traffic reading, shown as the road card's "Traffic" row.
export function formatTrafficDetail(condition: RoadCondition): LocalizedText {
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

export const ROAD_STATUS_DOT: Record<RoadTrafficStatus, StatusKind> = {
  clear: "ok",
  moderate: "warn",
  heavy: "warn",
  unknown: "none",
};

// The three rows every road card (fixed or personalized) shows once a route
// is known: time, distance, traffic. `extraItems` lets the personalized card
// prepend its resolved place name without duplicating this list.
export function buildRoadConditionItems(
  condition: RoadCondition,
  extraItems: StatusCardItem[] = [],
): StatusCardItem[] {
  return [
    ...extraItems,
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

const PERSONALIZED_ROAD_LABEL: LocalizedText = {
  ka: "გზა თქვენი მდებარეობიდან",
  en: "Road from your location",
  ru: "Дорога от вас",
};

const ALREADY_THERE_VALUE: LocalizedText = {
  ka: "თქვენ ბაკურიანში ხართ",
  en: "You're already in Bakuriani",
  ru: "Вы уже в Бакуриани",
};

const LOCATION_ITEM_LABEL: LocalizedText = {
  ka: "მდებარეობა",
  en: "Location",
  ru: "Местоположение",
};

export type PersonalizedRoad =
  | { kind: "already-there" }
  | { kind: "route"; placeName: string; condition: RoadCondition };

// Overlays the road card with the visitor's own route, the same way
// withLiveRoad (server.ts) overlays it with the fixed Tbilisi route. The
// title deliberately stays a fixed phrase rather than inflecting the
// resolved place name into Georgian (e.g. "მცხეთიდან" is not simply
// "მცხეთა" + "-დან") - the place name is shown as its own item row instead.
export function withPersonalizedRoad(
  cards: StatusCard[],
  result: PersonalizedRoad,
): StatusCard[] {
  return cards.map((card) => {
    if (card.id !== ROAD_CARD_ID) return card;

    if (result.kind === "already-there") {
      return {
        ...card,
        label: PERSONALIZED_ROAD_LABEL,
        value: ALREADY_THERE_VALUE,
        subValue: null,
        expandable: true,
        items: [],
      };
    }

    const { condition, placeName } = result;
    const locationItem: StatusCardItem[] = placeName
      ? [
          {
            id: "road-location",
            label: LOCATION_ITEM_LABEL,
            value: { ka: placeName, en: placeName, ru: placeName },
            status: "none",
            url: null,
          },
        ]
      : [];

    return {
      ...card,
      label: PERSONALIZED_ROAD_LABEL,
      value: ROAD_STATUS_LABEL[condition.trafficStatus],
      subValue: formatDuration(condition.durationSeconds),
      expandable: true,
      items: buildRoadConditionItems(condition, locationItem),
    };
  });
}
