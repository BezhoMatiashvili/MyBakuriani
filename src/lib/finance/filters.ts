// Register filters for the finance module (C42), spec §13: date, object,
// service type, user, payment method, status. Parsed from a URL query by the
// API routes and written back by the admin pages. No imports: allowed values
// are passed in, so scripts/unit can load this file directly.
//
// Dates are Asia/Tbilisi calendar days. Georgia has kept UTC+4 without
// daylight saving since 2005, so a day starts at T00:00:00+04:00 (the same
// boundary finance_monthly_totals() draws with AT TIME ZONE 'Asia/Tbilisi').

export const TBILISI_OFFSET = "+04:00";
const TBILISI_OFFSET_MS = 4 * 60 * 60 * 1000;

export const FINANCE_PAGE_SIZE = 50;
const MAX_QUERY_LENGTH = 100;

export type FinanceFilters = {
  /** First day, inclusive (YYYY-MM-DD). */
  from: string | null;
  /** Last day, inclusive (YYYY-MM-DD). */
  to: string | null;
  revenueType: string | null;
  method: string | null;
  status: string | null;
  /** Expense category or document type. */
  category: string | null;
  /** keepz | manual (payments) — whatever the caller allows. */
  source: string | null;
  payer: string | null;
  owner: string | null;
  property: string | null;
  service: string | null;
  /** Free text, trimmed; the server sanitizes it before use. */
  q: string;
  page: number;
};

export type FilterLists = {
  revenueTypes?: readonly string[];
  methods?: readonly string[];
  statuses?: readonly string[];
  categories?: readonly string[];
  sources?: readonly string[];
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

/** The first day of `date`'s month. */
export function monthStart(date: string): string {
  return `${date.slice(0, 7)}-01`;
}

/** The instant a Tbilisi day starts, as a timestamptz literal. */
export function dayStart(date: string): string {
  return `${date}T00:00:00${TBILISI_OFFSET}`;
}

/** The instant after a Tbilisi day ends (the next day's start). */
export function dayEndExclusive(date: string): string {
  return dayStart(addDays(date, 1));
}

/** Tbilisi calendar date of an instant. */
export function tbilisiDate(instant: string | Date): string {
  const time =
    typeof instant === "string" ? Date.parse(instant) : instant.getTime();
  return new Date(time + TBILISI_OFFSET_MS).toISOString().slice(0, 10);
}

/** "YYYY-MM-DD HH:MM" in Tbilisi time; "" for a missing or bad instant. */
export function tbilisiDateTime(instant: string | null | undefined): string {
  const time = instant ? Date.parse(instant) : Number.NaN;
  if (Number.isNaN(time)) return "";
  return new Date(time + TBILISI_OFFSET_MS)
    .toISOString()
    .slice(0, 16)
    .replace("T", " ");
}

/** A year between 2020 and 2100, else the fallback. */
export function parseYear(value: unknown, fallback: number): number {
  const n = typeof value === "string" ? Number(value) : Number.NaN;
  return Number.isInteger(n) && n >= 2020 && n <= 2100 ? n : fallback;
}

function pick(value: string | null, list?: readonly string[]): string | null {
  if (!value || !list) return null;
  return list.includes(value) ? value : null;
}

function uuid(value: string | null): string | null {
  return value && UUID_RE.test(value) ? value.toLowerCase() : null;
}

export function parseFinanceFilters(
  params: URLSearchParams,
  lists: FilterLists = {},
): FinanceFilters {
  let from = isIsoDate(params.get("from")) ? params.get("from") : null;
  let to = isIsoDate(params.get("to")) ? params.get("to") : null;
  if (from && to && from > to) [from, to] = [to, from];
  const page = Number(params.get("page"));
  return {
    from,
    to,
    revenueType: pick(params.get("type"), lists.revenueTypes),
    method: pick(params.get("method"), lists.methods),
    status: pick(params.get("status"), lists.statuses),
    category: pick(params.get("category"), lists.categories),
    source: pick(params.get("source"), lists.sources),
    payer: uuid(params.get("payer")),
    owner: uuid(params.get("owner")),
    property: uuid(params.get("property")),
    service: uuid(params.get("service")),
    q: (params.get("q") ?? "").trim().slice(0, MAX_QUERY_LENGTH),
    page: Number.isInteger(page) && page >= 1 && page <= 100000 ? page : 1,
  };
}

/** The query string for a filter set (empty values left out). */
export function filtersToQuery(
  filters: Partial<FinanceFilters>,
  extra: Record<string, string | number | null | undefined> = {},
): string {
  const params = new URLSearchParams();
  const entries: [string, unknown][] = [
    ["from", filters.from],
    ["to", filters.to],
    ["type", filters.revenueType],
    ["method", filters.method],
    ["status", filters.status],
    ["category", filters.category],
    ["source", filters.source],
    ["payer", filters.payer],
    ["owner", filters.owner],
    ["property", filters.property],
    ["service", filters.service],
    ["q", filters.q],
    ["page", filters.page && filters.page > 1 ? filters.page : null],
    ...Object.entries(extra),
  ];
  for (const [key, value] of entries) {
    if (value === null || value === undefined || value === "") continue;
    params.set(key, String(value));
  }
  return params.toString();
}
