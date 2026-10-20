// Admin free periods (contract C53): a standing rule "everyone who registers
// between A and B (with one of these roles) gets <benefit> until X". The
// database is the authority: the CHECK constraints, the free_periods_guard
// trigger and the free_period_* functions re-check every input and decide who
// qualifies. This module is the shared vocabulary plus the request parsers the
// API routes run first, so a bad request gets a precise error code before it
// reaches the database.
// No `@/` imports: scripts/unit/free-periods.test.mjs imports it.

/** = free_periods_benefit_check (check-contracts C53). */
export const FREE_PERIOD_BENEFITS = ["membership", "vip", "super_vip"] as const;
export type FreePeriodBenefit = (typeof FREE_PERIOD_BENEFITS)[number];

/** = enum user_role without 'admin' (free_periods_roles_check; check-contracts C53). */
export const FREE_PERIOD_ROLES = [
  "guest",
  "renter",
  "seller",
  "cleaner",
  "food",
  "entertainment",
  "transport",
  "employment",
  "handyman",
] as const;
export type FreePeriodRole = (typeof FREE_PERIOD_ROLES)[number];

/** = free_periods_name_check. */
export const FREE_PERIOD_NAME_MAX = 80;
/** = free_periods_max_listings_check. */
export const FREE_PERIOD_MAX_LISTINGS_LIMIT = 100;
/** The latest benefit end date an admin may pick, in years (same horizon as C44). */
export const FREE_PERIOD_MAX_END_YEARS = 2;

export const FREE_PERIOD_STATES = [
  "scheduled",
  "running",
  "ended",
  "paused",
] as const;
export type FreePeriodState = (typeof FREE_PERIOD_STATES)[number];

/** Roles the form ticks first for a benefit; the admin can change them. */
export function defaultRoles(benefit: FreePeriodBenefit): FreePeriodRole[] {
  return benefit === "membership" ? ["renter"] : [...FREE_PERIOD_ROLES];
}

/** Request error codes (API → UI `AdminFreePeriods.errors.<code>`). */
export const FREE_PERIOD_ERROR_CODES = [
  "invalid_request",
  "invalid_id",
  "invalid_name",
  "invalid_benefit",
  "invalid_window",
  "invalid_end_date",
  "end_before_window_end",
  "invalid_roles",
  "invalid_max_listings",
  "benefit_locked",
  "period_ended",
  "not_found",
  "forbidden",
  "rate_limited",
  "server_error",
] as const;
export type FreePeriodErrorCode = (typeof FREE_PERIOD_ERROR_CODES)[number];

/** Database exception tokens → request error codes. */
export const FREE_PERIOD_DB_ERRORS: Record<string, FreePeriodErrorCode> = {
  FREE_PERIOD_BENEFIT_LOCKED: "benefit_locked",
  FREE_PERIOD_ENDED: "period_ended",
  FREE_PERIOD_END_PAST: "invalid_end_date",
  FREE_PERIOD_NOT_FOUND: "not_found",
  ADMIN_STATUS_FORBIDDEN: "forbidden",
};

/** The request error code a database error message carries, if any. */
export function freePeriodErrorFromDb(
  message: string | null | undefined,
): FreePeriodErrorCode | null {
  const token = /FREE_PERIOD_[A-Z_]+|ADMIN_STATUS_FORBIDDEN/.exec(
    message ?? "",
  )?.[0];
  return token ? (FREE_PERIOD_DB_ERRORS[token] ?? null) : null;
}

// ---------------------------------------------------------------------------
// Dates (Asia/Tbilisi calendar days; Georgia has no DST)
// ---------------------------------------------------------------------------

const TBILISI_OFFSET_MS = 4 * 60 * 60 * 1000;

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

/** Tbilisi calendar date of an instant. */
export function tbilisiDateOf(instant: string): string {
  return new Date(Date.parse(instant) + TBILISI_OFFSET_MS)
    .toISOString()
    .slice(0, 10);
}

/** `date` + n days. */
export function addDays(date: string, n: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/** "2026-10-20" → "20.10.2026" (display only). */
export function formatDay(date: string): string {
  return date.split("-").reverse().join(".");
}

/** `date` + n years, clamped to the month's end (PostgreSQL's date + interval). */
export function addYears(date: string, years: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const lastDay = new Date(Date.UTC(y + years, m, 0)).getUTCDate();
  return new Date(Date.UTC(y + years, m - 1, Math.min(d, lastDay)))
    .toISOString()
    .slice(0, 10);
}

/** First instant of a Tbilisi day (= _admin_status_day_start). */
export function freePeriodDayStart(date: string): string {
  return `${date}T00:00:00+04:00`;
}

/** Last instant of a Tbilisi day (= _admin_status_day_end: 23:59:59.999999). */
export function freePeriodDayEnd(date: string): string {
  return `${date}T23:59:59.999999+04:00`;
}

/**
 * 31 Oct and 31 Mar close the summer and winter membership seasons
 * (renter_membership_season_window). A free membership that ends elsewhere
 * keeps its owner from pre-buying the next season, so the form hints at it.
 */
export function isSeasonEnd(date: string): boolean {
  return /-(10-31|03-31)$/.test(date);
}

// ---------------------------------------------------------------------------
// Request parsers
// ---------------------------------------------------------------------------

export type Parsed<T> =
  { ok: true; args: T } | { ok: false; error: FreePeriodErrorCode };

const fail = (error: FreePeriodErrorCode) => ({ ok: false as const, error });

/** The free_periods columns an admin writes (benefit never changes after create). */
export type FreePeriodColumns = {
  name: string;
  benefit: FreePeriodBenefit;
  registration_starts_at: string;
  registration_ends_at: string;
  benefit_ends_at: string;
  roles: FreePeriodRole[];
  max_listings: number | null;
  is_active: boolean;
};

/** The editable fields as the form holds them (dates are Tbilisi days). */
type Fields = {
  name: string;
  benefit: FreePeriodBenefit;
  registrationFrom: string;
  registrationTo: string;
  endDate: string;
  roles: FreePeriodRole[];
  maxListings: number | null;
  isActive: boolean;
};

type Body = Record<string, unknown>;

function asBody(value: unknown): Body | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Body)
    : null;
}

const has = (body: Body, key: string) => body[key] !== undefined;

function readName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const name = value.trim();
  return name.length >= 1 && name.length <= FREE_PERIOD_NAME_MAX ? name : null;
}

function readRoles(value: unknown): FreePeriodRole[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const roles: FreePeriodRole[] = [];
  for (const item of value) {
    if (!(FREE_PERIOD_ROLES as readonly unknown[]).includes(item)) return null;
    if (!roles.includes(item as FreePeriodRole)) {
      roles.push(item as FreePeriodRole);
    }
  }
  return roles;
}

/** null / undefined = every listing; else an integer 1..100. */
function readMaxListings(value: unknown): number | null | undefined {
  if (value === undefined || value === null) return null;
  return typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 1 &&
    value <= FREE_PERIOD_MAX_LISTINGS_LIMIT
    ? value
    : undefined;
}

/**
 * Cross-field checks of a complete form. `checkEndRange` is off when an edit
 * leaves the end date alone, so an ended period can still be renamed.
 */
function validate(
  fields: Fields,
  today: string,
  checkEndRange: boolean,
): Parsed<FreePeriodColumns> {
  if (fields.registrationFrom > fields.registrationTo) {
    return fail("invalid_window");
  }
  if (fields.endDate < fields.registrationTo) {
    return fail("end_before_window_end");
  }
  if (
    checkEndRange &&
    (fields.endDate < today ||
      fields.endDate > addYears(today, FREE_PERIOD_MAX_END_YEARS))
  ) {
    return fail("invalid_end_date");
  }
  if (fields.maxListings !== null && fields.benefit === "membership") {
    return fail("invalid_max_listings");
  }
  return {
    ok: true,
    args: {
      name: fields.name,
      benefit: fields.benefit,
      registration_starts_at: freePeriodDayStart(fields.registrationFrom),
      registration_ends_at: freePeriodDayEnd(fields.registrationTo),
      benefit_ends_at: freePeriodDayEnd(fields.endDate),
      roles: fields.roles,
      max_listings: fields.maxListings,
      is_active: fields.isActive,
    },
  };
}

/** POST body → the row to insert. */
export function parseFreePeriodCreate(
  body: unknown,
  today: string,
): Parsed<FreePeriodColumns> {
  const b = asBody(body);
  if (!b) return fail("invalid_request");
  const name = readName(b.name);
  if (name === null) return fail("invalid_name");
  if (!(FREE_PERIOD_BENEFITS as readonly unknown[]).includes(b.benefit)) {
    return fail("invalid_benefit");
  }
  if (!isIsoDate(b.registrationFrom) || !isIsoDate(b.registrationTo)) {
    return fail("invalid_window");
  }
  if (!isIsoDate(b.endDate)) return fail("invalid_end_date");
  const roles = readRoles(b.roles);
  if (!roles) return fail("invalid_roles");
  const maxListings = readMaxListings(b.maxListings);
  if (maxListings === undefined) return fail("invalid_max_listings");
  if (has(b, "isActive") && typeof b.isActive !== "boolean") {
    return fail("invalid_request");
  }
  return validate(
    {
      name,
      benefit: b.benefit as FreePeriodBenefit,
      registrationFrom: b.registrationFrom,
      registrationTo: b.registrationTo,
      endDate: b.endDate,
      roles,
      maxListings,
      isActive: b.isActive !== false,
    },
    today,
    true,
  );
}

const PATCH_KEYS = [
  "name",
  "registrationFrom",
  "registrationTo",
  "endDate",
  "roles",
  "maxListings",
  "isActive",
] as const;

/**
 * PATCH body → only the columns that change. The stored row fills the fields the
 * body leaves out, so the cross-field rules see the whole period. The benefit
 * never changes; an ended period keeps its end date.
 */
export function parseFreePeriodPatch(
  body: unknown,
  today: string,
  current: FreePeriodColumns,
  now: Date = new Date(),
): Parsed<Partial<FreePeriodColumns>> {
  const b = asBody(body);
  if (!b) return fail("invalid_request");
  if (has(b, "benefit") && b.benefit !== current.benefit) {
    return fail("benefit_locked");
  }
  if (!PATCH_KEYS.some((key) => has(b, key))) return fail("invalid_request");

  const fields: Fields = {
    name: current.name,
    benefit: current.benefit,
    registrationFrom: tbilisiDateOf(current.registration_starts_at),
    registrationTo: tbilisiDateOf(current.registration_ends_at),
    endDate: tbilisiDateOf(current.benefit_ends_at),
    roles: current.roles,
    maxListings: current.max_listings,
    isActive: current.is_active,
  };
  const previousEnd = fields.endDate;

  if (has(b, "name")) {
    const name = readName(b.name);
    if (name === null) return fail("invalid_name");
    fields.name = name;
  }
  if (has(b, "registrationFrom")) {
    if (!isIsoDate(b.registrationFrom)) return fail("invalid_window");
    fields.registrationFrom = b.registrationFrom;
  }
  if (has(b, "registrationTo")) {
    if (!isIsoDate(b.registrationTo)) return fail("invalid_window");
    fields.registrationTo = b.registrationTo;
  }
  if (has(b, "endDate")) {
    if (!isIsoDate(b.endDate)) return fail("invalid_end_date");
    fields.endDate = b.endDate;
  }
  if (has(b, "roles")) {
    const roles = readRoles(b.roles);
    if (!roles) return fail("invalid_roles");
    fields.roles = roles;
  }
  if (has(b, "maxListings")) {
    const maxListings = readMaxListings(b.maxListings);
    if (maxListings === undefined) return fail("invalid_max_listings");
    fields.maxListings = maxListings;
  }
  if (has(b, "isActive")) {
    if (typeof b.isActive !== "boolean") return fail("invalid_request");
    fields.isActive = b.isActive;
  }

  const endChanged = fields.endDate !== previousEnd;
  if (endChanged && Date.parse(current.benefit_ends_at) <= now.getTime()) {
    return fail("period_ended");
  }
  const checked = validate(fields, today, endChanged);
  if (!checked.ok) return checked;

  const update: Partial<FreePeriodColumns> = {};
  if (has(b, "name")) update.name = checked.args.name;
  if (has(b, "registrationFrom")) {
    update.registration_starts_at = checked.args.registration_starts_at;
  }
  if (has(b, "registrationTo")) {
    update.registration_ends_at = checked.args.registration_ends_at;
  }
  if (endChanged) update.benefit_ends_at = checked.args.benefit_ends_at;
  if (has(b, "roles")) update.roles = checked.args.roles;
  if (has(b, "maxListings")) update.max_listings = checked.args.max_listings;
  if (has(b, "isActive")) update.is_active = checked.args.is_active;
  return { ok: true, args: update };
}

// ---------------------------------------------------------------------------
// What the admin page shows
// ---------------------------------------------------------------------------

/**
 * scheduled: the registration window has not opened; running: it is open or the
 * benefit still runs; ended: the benefit end date passed; paused: switched off.
 * (Ended wins over paused: nothing can change an ended period anymore.)
 */
export function freePeriodState(
  period: {
    registration_starts_at: string;
    benefit_ends_at: string;
    is_active: boolean;
  },
  nowMs: number,
): FreePeriodState {
  if (Date.parse(period.benefit_ends_at) <= nowMs) return "ended";
  if (!period.is_active) return "paused";
  if (Date.parse(period.registration_starts_at) > nowMs) return "scheduled";
  return "running";
}

export type FreePeriodStats = {
  granted_members: number;
  granted_listings: number;
  waiting: number;
};

/** One period as the admin page receives it (dates are Tbilisi days). */
export type FreePeriodView = {
  id: string;
  name: string;
  benefit: FreePeriodBenefit;
  registrationFrom: string;
  registrationTo: string;
  endDate: string;
  roles: FreePeriodRole[];
  maxListings: number | null;
  isActive: boolean;
  state: FreePeriodState;
  grantedMembers: number;
  grantedListings: number;
  waiting: number;
  createdAt: string;
};

export type FreePeriodRow = FreePeriodColumns & {
  id: string;
  created_at: string;
};

export function toFreePeriodView(
  row: FreePeriodRow,
  stats: FreePeriodStats | undefined,
  nowMs: number,
): FreePeriodView {
  return {
    id: row.id,
    name: row.name,
    benefit: row.benefit,
    registrationFrom: tbilisiDateOf(row.registration_starts_at),
    registrationTo: tbilisiDateOf(row.registration_ends_at),
    endDate: tbilisiDateOf(row.benefit_ends_at),
    roles: row.roles,
    maxListings: row.max_listings,
    isActive: row.is_active,
    state: freePeriodState(row, nowMs),
    grantedMembers: stats?.granted_members ?? 0,
    grantedListings: stats?.granted_listings ?? 0,
    waiting: stats?.waiting ?? 0,
    createdAt: row.created_at,
  };
}

/** What free_period_apply returns (the route sums it over the rounds of one click). */
export type FreePeriodApplyResult = {
  state: "running" | "paused" | "ended" | "busy";
  granted_members: number;
  granted_listings: number;
  redated: number;
  skipped: number;
  remaining: number;
};
