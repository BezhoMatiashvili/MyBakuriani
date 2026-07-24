import "server-only";
import { cache } from "react";
import { createPublicClient } from "@/lib/supabase/server";
import type {
  LocalizedText,
  StatusCard,
  StatusCardItem,
  StatusKind,
} from "@/lib/status-cards/types";

// Reads the live Tbilisi -> Bakuriani road status (written every 30 min by the
// road-condition-refresh edge function from the Google Routes API) and overlays
// it onto the admin-managed "road" status card. Mirrors src/lib/weather/server.ts:
// live data always wins for the value/detail, while the card's presence and
// label stay admin-editable. DB-backed (not an inline fetch) because Routes is a
// paid API refreshed on a fixed cadence — see the edge function for the why.

const ROUTE_SLUG = "tbilisi_bakuriani";
const ROAD_CARD_ID = "road";

export type RoadStatusCode = "clear" | "moderate" | "heavy" | "unknown";

export type RoadCondition = {
  statusCode: RoadStatusCode;
  durationSeconds: number | null;
  distanceMeters: number | null;
  computedAt: string;
};

type RoadConditionRow = {
  status_code: string | null;
  duration_seconds: number | null;
  distance_meters: number | null;
  computed_at: string | null;
};

function normalizeStatus(code: string | null): RoadStatusCode {
  return code === "clear" || code === "moderate" || code === "heavy"
    ? code
    : "unknown";
}

// Fetches the latest road condition. Returns null on any error (network, bad
// shape, missing row) so the caller falls back to the existing card value
// instead of rendering blank. cache() dedupes within a single render.
export const getRoadCondition = cache(
  async (): Promise<RoadCondition | null> => {
    try {
      const db = createPublicClient();
      const { data, error } = await db
        .from("road_conditions")
        .select("status_code, duration_seconds, distance_meters, computed_at")
        .eq("route_slug", ROUTE_SLUG)
        .maybeSingle();

      if (error || !data) return null;
      const row = data as RoadConditionRow;
      if (!row.computed_at) return null;

      return {
        statusCode: normalizeStatus(row.status_code),
        durationSeconds: row.duration_seconds,
        distanceMeters: row.distance_meters,
        computedAt: row.computed_at,
      };
    } catch {
      return null;
    }
  },
);

const STATUS_LABELS: Record<RoadStatusCode, LocalizedText> = {
  clear: { ka: "თავისუფალი", en: "Clear", ru: "Свободна" },
  moderate: { ka: "საშუალო", en: "Moderate", ru: "Средняя" },
  heavy: { ka: "დატვირთული", en: "Heavy", ru: "Загружена" },
  unknown: { ka: "უცნობია", en: "Unknown", ru: "Неизвестно" },
};

// Colours the dot next to the ETA detail row per congestion level.
const STATUS_DOT: Record<RoadStatusCode, StatusKind> = {
  clear: "ok",
  moderate: "warn",
  heavy: "closed",
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

// Distance in metres -> whole kilometres: "183 კმ".
function formatDistance(meters: number): LocalizedText {
  const km = Math.round(meters / 1000);
  return { ka: `${km} კმ`, en: `${km} km`, ru: `${km} км` };
}

// Absolute Tbilisi-local clock time — deliberately NOT relative ("X წთ წინ"):
// this string is computed once server-side, so under any page caching a relative
// label would freeze and mislead, whereas an absolute time stays correct.
function formatClock(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Tbilisi",
  }).format(new Date(iso));
}

function buildItems(condition: RoadCondition): StatusCardItem[] {
  const items: StatusCardItem[] = [];
  const dot = STATUS_DOT[condition.statusCode];

  if (condition.durationSeconds !== null) {
    items.push({
      id: "road-eta",
      label: { ka: "დრო", en: "Time", ru: "Время" },
      value: formatDuration(condition.durationSeconds),
      status: dot,
      url: null,
    });
  }
  if (condition.distanceMeters !== null) {
    items.push({
      id: "road-distance",
      label: { ka: "მანძილი", en: "Distance", ru: "Расстояние" },
      value: formatDistance(condition.distanceMeters),
      status: "none",
      url: null,
    });
  }
  const clock = formatClock(condition.computedAt);
  items.push({
    id: "road-updated",
    label: { ka: "განახლდა", en: "Updated", ru: "Обновлено" },
    value: { ka: clock, en: clock, ru: clock },
    status: "none",
    url: null,
  });
  return items;
}

// Overrides the road card's value/detail with the live condition. No-op when the
// condition is unavailable (null) or still 'unknown' (pre-first-run / outage), so
// the admin-editable default value shows through instead of "უცნობია".
export function withLiveRoad(
  cards: StatusCard[],
  condition: RoadCondition | null,
): StatusCard[] {
  if (!condition || condition.statusCode === "unknown") return cards;
  const items = buildItems(condition);
  return cards.map((card) =>
    card.id === ROAD_CARD_ID
      ? {
          ...card,
          value: STATUS_LABELS[condition.statusCode],
          redDot: condition.statusCode === "heavy",
          expandable: true,
          items,
        }
      : card,
  );
}
