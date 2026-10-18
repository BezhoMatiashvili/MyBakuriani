// Admin analytics (C49): the vocabularies the dashboard, the API routes, the
// exports and the SQL functions share, plus the period, URL-query and session
// cookie rules. Pure (no imports) so scripts/unit can load it. The CHECK lists
// and function outputs in supabase/migrations/20261006240000_admin_analytics.sql
// must equal these lists (scripts/unit/analytics-model.test.mjs, check-contracts
// C49).
//
// Dates are Asia/Tbilisi calendar days (UTC+4, no daylight saving since 2005)
// and ranges are inclusive on both ends, as the SQL functions take them.

export const TRAFFIC_SOURCES = [
  "google",
  "facebook",
  "instagram",
  "direct",
  "referral",
] as const;
export type TrafficSource = (typeof TRAFFIC_SOURCES)[number];

export const DEVICES = ["mobile", "tablet", "desktop"] as const;
export type Device = (typeof DEVICES)[number];

/** Sections of the public site; `analytics_page_type(path)` returns these. */
export const PAGE_TYPES = [
  "home",
  "apartments",
  "hotels",
  "sales",
  "food",
  "services",
  "entertainment",
  "transport",
  "employment",
  "search",
  "blog",
  "guide",
  "info",
  "other",
] as const;
export type PageType = (typeof PAGE_TYPES)[number];

/** Listing categories; `analytics_listing_kind(...)` returns these. */
export const LISTING_KINDS = [
  "apartments",
  "hotels",
  "sales",
  "food",
  "services",
  "entertainment",
  "transport",
  "employment",
] as const;
export type ListingKind = (typeof LISTING_KINDS)[number];

/** `analytics_events.name` (CHECK). */
export const EVENT_NAMES = [
  "listing_view",
  "save",
  "call",
  "message",
  "smart_match_request",
  "job_application",
] as const;
export type EventName = (typeof EVENT_NAMES)[number];

/** Key Actions / Leads (spec §2): the events that are a contact or a request. */
export const LEAD_EVENTS = [
  "call",
  "message",
  "smart_match_request",
  "job_application",
] as const;

/**
 * Events the browser may report through /api/track/event. The others are
 * written by the server routes that perform the action, never by the client.
 */
export const CLIENT_EVENTS = ["save", "smart_match_request"] as const;
export type ClientEvent = (typeof CLIENT_EVENTS)[number];

export const PERIOD_PRESETS = [
  "today",
  "yesterday",
  "last7",
  "last30",
  "thisMonth",
  "custom",
] as const;
export type PeriodPreset = (typeof PERIOD_PRESETS)[number];
export const DEFAULT_PERIOD: PeriodPreset = "last30";

export const GRANULARITIES = ["day", "week", "month"] as const;
export type Granularity = (typeof GRANULARITIES)[number];

/** `GET /api/admin/analytics?block=` */
export const DATA_BLOCKS = [
  "traffic",
  "listings",
  "smartmatch",
  "ads",
  "live",
] as const;
export type DataBlock = (typeof DATA_BLOCKS)[number];

/** `GET /api/admin/analytics/export?block=` ("all" = the whole page). */
export const EXPORT_BLOCKS = [
  "kpis",
  "chart",
  "sources",
  "listings",
  "smartmatch",
  "ads",
  "live",
  "all",
] as const;
export type ExportBlock = (typeof EXPORT_BLOCKS)[number];

/** filtered = period + every active filter; full = the period, no filters. */
export const EXPORT_SCOPES = ["filtered", "full"] as const;
export type ExportScope = (typeof EXPORT_SCOPES)[number];

export const EXPORT_FORMATS = ["xlsx", "csv", "pdf"] as const;
export type ExportFormat = (typeof EXPORT_FORMATS)[number];

/** URL keys of the dimension filters, in the order the chain shows them. */
export const DIMENSION_KEYS = [
  "device",
  "country",
  "city",
  "source",
  "page",
] as const;
export type DimensionKey = (typeof DIMENSION_KEYS)[number];

/**
 * Longest period, inclusive: admin_banner_analytics (the ads block) refuses
 * more, so analytics_check_range and the period picker use the same cap.
 */
export const MAX_RANGE_DAYS = 366;
/** Live Now: someone active within this many minutes is "on the site now". */
export const LIVE_WINDOW_MINUTES = 5;
/** A session is engaged after this much visible time (or 2 views / a lead). */
export const ENGAGED_SESSION_MS = 10_000;

// ---------------------------------------------------------------- tracking

export const VISITOR_COOKIE = "mb_vid";
export const SESSION_COOKIE = "mb_sid";
/** A session ends after 30 minutes without a hit (rolling cookie Max-Age). */
export const SESSION_IDLE_SECONDS = 30 * 60;
/** One engagement ping adds at most this much visible time. */
export const MAX_PING_MS = 5 * 60 * 1000;
/** Keepalive cadence for Live Now (visible + recently used tabs only). */
export const KEEPALIVE_MS = 120_000;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuidValue(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

export function isOneOf<T extends string>(
  list: readonly T[],
  value: unknown,
): value is T {
  return (
    typeof value === "string" && (list as readonly string[]).includes(value)
  );
}

export type SessionCookie = {
  id: string;
  source: TrafficSource;
  device: Device;
};

/**
 * `mb_sid` = `<uuid>.<source>.<device>`: the session id plus the source and
 * device class it started with. Actions recorded on pages that send no page
 * view (dashboards, API routes) inherit these, so they filter like the views.
 */
export function parseSessionCookie(
  raw: string | null | undefined,
): SessionCookie | null {
  if (typeof raw !== "string" || raw.length > 80) return null;
  const [id, source, device, ...rest] = raw.split(".");
  return rest.length === 0 &&
    isUuidValue(id) &&
    isOneOf(TRAFFIC_SOURCES, source) &&
    isOneOf(DEVICES, device)
    ? { id: id.toLowerCase(), source, device }
    : null;
}

export function formatSessionCookie(session: SessionCookie): string {
  return `${session.id}.${session.source}.${session.device}`;
}

/**
 * Whether a page view continues the current session. A new session starts
 * when there is none (expired cookie) or when the hit arrives from a new
 * external source (GA-style: a fresh campaign or referral starts a session).
 */
export function continuesSession(
  current: SessionCookie | null,
  external: boolean,
  hitSource: TrafficSource,
): boolean {
  if (!current) return false;
  if (!external) return true;
  return current.source === hitSource;
}

/** utm_* value: trimmed, lower-case, at most 100 characters, else null. */
export function cleanUtm(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const v = value.trim().toLowerCase().slice(0, 100);
  return v && !/[\u0000-\u001f]/.test(v) ? v : null;
}

/** Visible milliseconds reported by one ping, clamped to [0, MAX_PING_MS]. */
export function clampPingMs(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(Math.round(n), MAX_PING_MS);
}

/** `ads.advertiser` CHECK: 1–120 characters, or NULL (spec §7). */
export const ADVERTISER_MAX_LENGTH = 120;

/**
 * The client an ad is sold to, as stored: whitespace runs become one space and
 * "" means none (null). `undefined` = cannot be stored (not a string, or
 * longer than ADVERTISER_MAX_LENGTH).
 */
export function parseAdvertiser(value: unknown): string | null | undefined {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") return undefined;
  const v = value.replace(/\s+/g, " ").trim();
  if (!v) return null;
  return v.length <= ADVERTISER_MAX_LENGTH ? v : undefined;
}

// ------------------------------------------------------------------ dates

const TBILISI_OFFSET_MS = 4 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** A real calendar date written YYYY-MM-DD between 2020 and 2100. */
export function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const [y, m, d] = value.split("-").map(Number);
  if (y < 2020 || y > 2100) return false;
  const date = new Date(Date.UTC(y, m - 1, d));
  return (
    date.getUTCFullYear() === y &&
    date.getUTCMonth() === m - 1 &&
    date.getUTCDate() === d
  );
}

/** Today's date in Tbilisi. */
export function tbilisiToday(now: Date = new Date()): string {
  return new Date(now.getTime() + TBILISI_OFFSET_MS).toISOString().slice(0, 10);
}

/** The calendar day n days after `date` (n may be negative). */
export function addDays(date: string, n: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/** "YYYY-MM-DD HH:MM" in Tbilisi time. */
export function tbilisiDateTime(now: Date = new Date()): string {
  return new Date(now.getTime() + TBILISI_OFFSET_MS)
    .toISOString()
    .slice(0, 16)
    .replace("T", " ");
}

export type DateRange = { from: string; to: string };

/** Number of days in an inclusive range. */
export function rangeDays(range: DateRange): number {
  return (
    Math.round((Date.parse(range.to) - Date.parse(range.from)) / DAY_MS) + 1
  );
}

/** The range a preset covers on `today` (null for "custom"). */
export function presetRange(
  preset: PeriodPreset,
  today: string,
): DateRange | null {
  switch (preset) {
    case "today":
      return { from: today, to: today };
    case "yesterday": {
      const y = addDays(today, -1);
      return { from: y, to: y };
    }
    case "last7":
      return { from: addDays(today, -6), to: today };
    case "last30":
      return { from: addDays(today, -29), to: today };
    case "thisMonth":
      return { from: `${today.slice(0, 7)}-01`, to: today };
    default:
      return null;
  }
}

/** The same number of days immediately before `range` ("compare" period). */
export function previousRange(range: DateRange): DateRange {
  const days = rangeDays(range);
  return { from: addDays(range.from, -days), to: addDays(range.from, -1) };
}

// ------------------------------------------------------------------ query

export type Dimensions = {
  device: Device | null;
  country: string | null;
  city: string | null;
  source: TrafficSource | null;
  page: PageType | null;
};

export const EMPTY_DIMENSIONS: Dimensions = {
  device: null,
  country: null,
  city: null,
  source: null,
  page: null,
};

export type AnalyticsQuery = {
  period: PeriodPreset;
  range: DateRange;
  compare: boolean;
  granularity: Granularity;
  dims: Dimensions;
};

/** ISO 3166 alpha-2, upper-case. */
export function cleanCountry(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const v = value.trim().toUpperCase();
  return /^[A-Z]{2}$/.test(v) ? v : null;
}

/** A city name as stored (1-80 characters, no control characters). */
export function cleanCity(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const v = value.trim();
  return v.length > 0 && v.length <= 80 && !/[\u0000-\u001f<>]/.test(v)
    ? v
    : null;
}

export function hasDimensionFilter(dims: Dimensions): boolean {
  return DIMENSION_KEYS.some((key) => dims[key] !== null);
}

/**
 * Reads the dashboard query. The page, the data route and the export route all
 * use this one parser, so an export always covers what the page shows.
 * Anything invalid falls back to the default rather than failing.
 */
export function parseAnalyticsQuery(
  params: URLSearchParams,
  today: string = tbilisiToday(),
): AnalyticsQuery {
  let period: PeriodPreset = isOneOf(PERIOD_PRESETS, params.get("period"))
    ? (params.get("period") as PeriodPreset)
    : DEFAULT_PERIOD;
  let range = presetRange(period, today);
  if (period === "custom") {
    const from = params.get("from");
    const to = params.get("to");
    if (
      isIsoDate(from) &&
      isIsoDate(to) &&
      from <= to &&
      to <= today &&
      rangeDays({ from, to }) <= MAX_RANGE_DAYS
    ) {
      range = { from, to };
    } else {
      period = DEFAULT_PERIOD;
      range = presetRange(DEFAULT_PERIOD, today);
    }
  }
  const granularity = isOneOf(GRANULARITIES, params.get("gran"))
    ? (params.get("gran") as Granularity)
    : "day";
  const device = params.get("device");
  const source = params.get("source");
  const page = params.get("page");
  const country = cleanCountry(params.get("country"));
  return {
    period,
    range: range as DateRange,
    compare: params.get("compare") === "1",
    granularity,
    dims: {
      device: isOneOf(DEVICES, device) ? device : null,
      country,
      // A city only means something inside its country.
      city: country ? cleanCity(params.get("city")) : null,
      source: isOneOf(TRAFFIC_SOURCES, source) ? source : null,
      page: isOneOf(PAGE_TYPES, page) ? page : null,
    },
  };
}

/** The canonical URL query for a dashboard state (inverse of the parser). */
export function analyticsQueryToParams(query: AnalyticsQuery): URLSearchParams {
  const params = new URLSearchParams();
  params.set("period", query.period);
  if (query.period === "custom") {
    params.set("from", query.range.from);
    params.set("to", query.range.to);
  }
  if (query.compare) params.set("compare", "1");
  if (query.granularity !== "day") params.set("gran", query.granularity);
  for (const key of DIMENSION_KEYS) {
    const value = query.dims[key];
    if (value !== null) params.set(key, value);
  }
  return params;
}

/** "Full data" export: the same period, every dimension filter removed. */
export function withoutDimensions(query: AnalyticsQuery): AnalyticsQuery {
  return { ...query, dims: { ...EMPTY_DIMENSIONS } };
}
