// Admin status management (contract C44): memberships, listing VIP / SUPER
// VIP, discount badges and company plans. The database is the authority:
// admin_change_memberships / admin_change_listing_promotions /
// admin_change_company_plans re-check every input and compute every result
// (a dry run performs the change and rolls it back). This module is the
// shared vocabulary plus the request parsers the API routes run first, so a
// bad request gets a precise error code before it reaches the database.
// No `@/` imports: scripts/unit/admin-statuses.test.mjs imports it.

/** = the user_subscriptions_status_check list (check-contracts C44). */
export const MEMBERSHIP_STATUSES = [
  "pending_approval",
  "active",
  "rejected",
  "revoked",
] as const;
export type MembershipStatus = (typeof MEMBERSHIP_STATUSES)[number];

/** One RPC call (and one "select all matching") never exceeds this. */
export const ADMIN_STATUS_MAX_TARGETS = 200;
export const ADMIN_STATUS_MAX_DAYS = 365;
export const ADMIN_STATUS_MAX_END_YEARS = 2;
export const ADMIN_STATUS_NOTE_MAX = 300;
export const DISCOUNT_PERCENT_MIN = 1;
export const DISCOUNT_PERCENT_MAX = 90;
export const ADMIN_STATUS_PAGE_SIZE = 50;

/** Each list = the RPC's c_actions (check-contracts C44). */
export const MEMBERSHIP_ACTIONS = [
  "extend",
  "shorten",
  "set_end",
  "grant",
  "revoke",
  "set_period",
] as const;
export type MembershipAction = (typeof MEMBERSHIP_ACTIONS)[number];

export const LISTING_ACTIONS = [
  "vip_grant",
  "vip_extend",
  "vip_shorten",
  "vip_set_end",
  "vip_set_tier",
  "vip_end",
  "discount_set",
  "discount_extend",
  "discount_shorten",
  "discount_set_end",
  "discount_end",
] as const;
export type ListingAction = (typeof LISTING_ACTIONS)[number];

export const COMPANY_ACTIONS = [
  "grant",
  "extend",
  "shorten",
  "set_end",
  "set_tier",
  "end",
] as const;
export type CompanyAction = (typeof COMPANY_ACTIONS)[number];

export const VIP_TIERS = ["vip", "super"] as const;
export type VipTier = (typeof VIP_TIERS)[number];

/** = organization_subscriptions.tier CHECK (src/lib/org-tiers.ts). */
export const COMPANY_PLAN_TIERS = [
  "entry",
  "pro",
  "premium",
  "premium_plus",
] as const;
export type CompanyPlanTier = (typeof COMPANY_PLAN_TIERS)[number];

/** = admin_membership_overview_v.state. */
export const MEMBERSHIP_STATES = [
  "active",
  "upcoming",
  "pending",
  "expired",
  "revoked",
  "none",
] as const;
export type MembershipState = (typeof MEMBERSHIP_STATES)[number];

/** = admin_company_plans_v.state. */
export const COMPANY_STATES = ["active", "expired", "none"] as const;
export type CompanyState = (typeof COMPANY_STATES)[number];

/** Listing filter chips over admin_listing_promotions_v. */
export const PROMOTION_FILTERS = [
  "super",
  "vip",
  "discount",
  "none",
  "permanent",
] as const;
export type PromotionFilter = (typeof PROMOTION_FILTERS)[number];

/** = admin_listing_promotions_v.category. */
export const LISTING_CATEGORIES = [
  "rental",
  "hotel",
  "sale",
  "food",
  "transport",
  "entertainment",
  "employment",
  "cleaning",
  "handyman",
] as const;
export type ListingCategory = (typeof LISTING_CATEGORIES)[number];

/** = the listing_status enum of properties and services. */
export const LISTING_STATUSES = [
  "active",
  "pending",
  "draft",
  "blocked",
] as const;
export type ListingStatus = (typeof LISTING_STATUSES)[number];

/** Membership list scope: users with any membership row, or every profile. */
export const MEMBERSHIP_SCOPES = ["members", "all"] as const;
export type MembershipScope = (typeof MEMBERSHIP_SCOPES)[number];

/** = pricing_packages.meta.season of the renter packages. */
export const MEMBERSHIP_SEASONS = ["winter", "summer"] as const;
export type MembershipSeason = (typeof MEMBERSHIP_SEASONS)[number];

/** "Expiring within" filter windows, in days. */
export const EXPIRING_WINDOWS = [7, 30] as const;

/** Per-row reasons the RPCs give for a skipped row. */
export const SKIP_REASONS = [
  "user_not_found",
  "listing_not_found",
  "company_not_found",
  "no_active_membership",
  "not_live",
  "whole_period",
  "no_change",
  "overlaps_existing",
  "overlaps_pending",
  "has_active_tier",
  "not_active",
  "permanent_set_end_first",
  "same_tier",
  "food_menu_discounts",
  "has_active_plan",
  "no_active_plan",
  "company_not_active",
] as const;
export type SkipReason = (typeof SKIP_REASONS)[number];

/** Request error codes (API → UI `errors.<code>`). */
export const ADMIN_STATUS_ERROR_CODES = [
  "invalid_request",
  "invalid_action",
  "invalid_targets",
  "invalid_days",
  "invalid_date",
  "invalid_period",
  "period_required",
  "invalid_tier",
  "invalid_percent",
  "invalid_package",
  "invalid_refund",
  "refund_too_large",
  "note_too_long",
  "subscription_not_found",
  "too_many",
  "forbidden",
  "rate_limited",
  "server_error",
] as const;
export type AdminStatusErrorCode = (typeof ADMIN_STATUS_ERROR_CODES)[number];

/** RPC exception tokens → request error codes. */
export const ADMIN_STATUS_DB_ERRORS: Record<string, AdminStatusErrorCode> = {
  ADMIN_STATUS_FORBIDDEN: "forbidden",
  ADMIN_STATUS_ACTION_INVALID: "invalid_action",
  ADMIN_STATUS_TARGETS_INVALID: "invalid_targets",
  ADMIN_STATUS_DAYS_INVALID: "invalid_days",
  ADMIN_STATUS_DATE_INVALID: "invalid_date",
  ADMIN_STATUS_PERIOD_INVALID: "invalid_period",
  ADMIN_STATUS_PERIOD_REQUIRED: "period_required",
  ADMIN_STATUS_TIER_INVALID: "invalid_tier",
  ADMIN_STATUS_PERCENT_INVALID: "invalid_percent",
  ADMIN_STATUS_PACKAGE_INVALID: "invalid_package",
  ADMIN_STATUS_REFUND_INVALID: "invalid_refund",
  ADMIN_STATUS_REFUND_TOO_LARGE: "refund_too_large",
  ADMIN_STATUS_NOTE_TOO_LONG: "note_too_long",
  ADMIN_STATUS_SUBSCRIPTION_NOT_FOUND: "subscription_not_found",
};

/** The request error code an RPC error message carries, if any. */
export function adminStatusErrorFromDb(
  message: string | null | undefined,
): AdminStatusErrorCode | null {
  const token = /ADMIN_STATUS_[A-Z_]+/.exec(message ?? "")?.[0];
  return token ? (ADMIN_STATUS_DB_ERRORS[token] ?? null) : null;
}

// ---------------------------------------------------------------------------
// Dates (Asia/Tbilisi calendar days; Georgia has no DST)
// ---------------------------------------------------------------------------

const TBILISI_OFFSET_MS = 4 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

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

/** "YYYY-MM-DD HH:MM" in Tbilisi time. */
export function tbilisiDateTimeOf(instant: string): string {
  return new Date(Date.parse(instant) + TBILISI_OFFSET_MS)
    .toISOString()
    .slice(0, 16)
    .replace("T", " ");
}

/** The instant a Tbilisi day starts (timestamptz literal). */
export function tbilisiDayStart(date: string): string {
  return `${date}T00:00:00+04:00`;
}

/** `date` + n days. */
export function addDays(date: string, n: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/** `date` + n years, clamped to the month's end (PostgreSQL's date + interval). */
export function addYears(date: string, years: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const lastDay = new Date(Date.UTC(y + years, m, 0)).getUTCDate();
  return new Date(Date.UTC(y + years, m - 1, Math.min(d, lastDay)))
    .toISOString()
    .slice(0, 10);
}

/** The latest end date an admin may pick (= _admin_status_check_end_date). */
export function maxEndDate(today: string): string {
  return addYears(today, ADMIN_STATUS_MAX_END_YEARS);
}

/** An end date the database accepts: today .. today + 2 years. */
export function isValidEndDate(value: unknown, today: string): boolean {
  return isIsoDate(value) && value >= today && value <= maxEndDate(today);
}

/**
 * Time left until `expiresAt`: whole days and the remaining hours, or null
 * once it has passed. Display only; the database decides what is active.
 */
export function remaining(
  expiresAt: string | null | undefined,
  nowMs: number,
): { days: number; hours: number } | null {
  if (!expiresAt) return null;
  const left = Date.parse(expiresAt) - nowMs;
  if (!Number.isFinite(left) || left <= 0) return null;
  const days = Math.floor(left / DAY_MS);
  const hours = Math.floor((left - days * DAY_MS) / HOUR_MS);
  return { days, hours };
}

// ---------------------------------------------------------------------------
// Request parsers (body → RPC arguments without p_admin_id)
// ---------------------------------------------------------------------------

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

export type Parsed<T> =
  { ok: true; args: T } | { ok: false; error: AdminStatusErrorCode };

const fail = (error: AdminStatusErrorCode) => ({ ok: false as const, error });

type Body = Record<string, unknown>;

function asBody(value: unknown): Body | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Body)
    : null;
}

const present = (value: unknown) => value !== undefined && value !== null;

function readIds(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const ids = [...new Set(value)];
  if (ids.length === 0 || ids.length > ADMIN_STATUS_MAX_TARGETS) return null;
  return ids.every(isUuid) ? (ids as string[]) : null;
}

function readDays(value: unknown): number | null {
  return typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 1 &&
    value <= ADMIN_STATUS_MAX_DAYS
    ? value
    : null;
}

type Common = { p_notify: boolean; p_note?: string; p_dry_run: boolean };

function readCommon(body: Body): Common | AdminStatusErrorCode {
  if (present(body.note) && typeof body.note !== "string") {
    return "invalid_request";
  }
  const note = typeof body.note === "string" ? body.note.trim() : "";
  if (note.length > ADMIN_STATUS_NOTE_MAX) return "note_too_long";
  const common: Common = {
    p_notify: body.notify === true,
    // Only an explicit false applies; anything else previews.
    p_dry_run: body.dryRun !== false,
  };
  if (note) common.p_note = note;
  return common;
}

/** Exactly one of days / endDate, both valid. */
function readPeriod(
  body: Body,
  today: string,
): { p_days: number } | { p_end_date: string } | AdminStatusErrorCode {
  const hasDays = present(body.days);
  if (hasDays === present(body.endDate)) return "period_required";
  if (hasDays) {
    const days = readDays(body.days);
    return days === null ? "invalid_days" : { p_days: days };
  }
  return isValidEndDate(body.endDate, today)
    ? { p_end_date: body.endDate as string }
    : "invalid_date";
}

export type MembershipRpcArgs = Common & {
  p_action: MembershipAction;
  p_user_ids?: string[];
  p_subscription_id?: string;
  p_days?: number;
  p_start_date?: string;
  p_end_date?: string;
  p_package_id?: string;
  p_refund?: boolean;
  p_refund_amount?: number;
};

export function parseMembershipChange(
  input: unknown,
  today: string,
): Parsed<MembershipRpcArgs> {
  const body = asBody(input);
  if (!body) return fail("invalid_request");
  const action = body.action as MembershipAction;
  if (!MEMBERSHIP_ACTIONS.includes(action)) return fail("invalid_action");
  const common = readCommon(body);
  if (typeof common === "string") return fail(common);
  const args: MembershipRpcArgs = { ...common, p_action: action };

  // set_period and a single-row revoke name one subscription; the rest users.
  const rowTarget =
    action === "set_period" ||
    (action === "revoke" && present(body.subscriptionId));
  if (rowTarget) {
    if (!isUuid(body.subscriptionId) || present(body.userIds)) {
      return fail("invalid_targets");
    }
    args.p_subscription_id = body.subscriptionId;
  } else {
    const ids = readIds(body.userIds);
    if (!ids) return fail("invalid_targets");
    args.p_user_ids = ids;
  }

  if (action === "extend" || action === "shorten") {
    const days = readDays(body.days);
    if (days === null) return fail("invalid_days");
    args.p_days = days;
  } else if (action === "set_end") {
    if (!isValidEndDate(body.endDate, today)) return fail("invalid_date");
    args.p_end_date = body.endDate as string;
  } else if (action === "set_period") {
    const start = body.startDate;
    const end = body.endDate;
    if (!present(start) && !present(end)) return fail("period_required");
    if (present(end)) {
      if (!isValidEndDate(end, today)) return fail("invalid_date");
      args.p_end_date = end as string;
    }
    if (present(start)) {
      if (
        !isIsoDate(start) ||
        start < addYears(today, -ADMIN_STATUS_MAX_END_YEARS) ||
        start > maxEndDate(today)
      ) {
        return fail("invalid_date");
      }
      args.p_start_date = start;
    }
    if (present(start) && present(end) && (end as string) < (start as string)) {
      return fail("invalid_period");
    }
  } else if (action === "grant") {
    if (present(body.packageId)) {
      if (!isUuid(body.packageId)) return fail("invalid_package");
      args.p_package_id = body.packageId;
    }
    const start = body.startDate;
    const end = body.endDate;
    if (present(end)) {
      if (!isValidEndDate(end, today)) return fail("invalid_date");
      args.p_end_date = end as string;
      if (present(start)) {
        if (!isIsoDate(start) || start < today) return fail("invalid_date");
        if ((end as string) < start) return fail("invalid_period");
        args.p_start_date = start;
      }
    } else if (!args.p_package_id || present(start)) {
      // Without an end date the period is the package's season.
      return fail("period_required");
    }
  } else if (action === "revoke") {
    args.p_refund = body.refund === true;
    if (present(body.refundAmount)) {
      const amount = body.refundAmount;
      if (
        !rowTarget ||
        !args.p_refund ||
        typeof amount !== "number" ||
        !Number.isFinite(amount) ||
        amount <= 0 ||
        Math.round(amount * 100) !== amount * 100
      ) {
        return fail("invalid_refund");
      }
      args.p_refund_amount = amount;
    }
  }
  return { ok: true, args };
}

export type ListingTarget = { kind: "property" | "service"; id: string };

export type ListingRpcArgs = Common & {
  p_action: ListingAction;
  p_targets: ListingTarget[];
  p_tier?: VipTier;
  p_days?: number;
  p_end_date?: string;
  p_discount_percent?: number;
};

export function parseListingChange(
  input: unknown,
  today: string,
): Parsed<ListingRpcArgs> {
  const body = asBody(input);
  if (!body) return fail("invalid_request");
  const action = body.action as ListingAction;
  if (!LISTING_ACTIONS.includes(action)) return fail("invalid_action");
  const common = readCommon(body);
  if (typeof common === "string") return fail(common);

  if (!Array.isArray(body.targets)) return fail("invalid_targets");
  const seen = new Set<string>();
  const targets: ListingTarget[] = [];
  for (const raw of body.targets) {
    const t = asBody(raw);
    if (
      !t ||
      (t.kind !== "property" && t.kind !== "service") ||
      !isUuid(t.id)
    ) {
      return fail("invalid_targets");
    }
    const key = `${t.kind}:${t.id.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    targets.push({ kind: t.kind, id: t.id });
  }
  if (targets.length === 0 || targets.length > ADMIN_STATUS_MAX_TARGETS) {
    return fail("invalid_targets");
  }
  const args: ListingRpcArgs = {
    ...common,
    p_action: action,
    p_targets: targets,
  };

  if (action === "vip_grant" || action === "vip_set_tier") {
    if (!VIP_TIERS.includes(body.tier as VipTier)) return fail("invalid_tier");
    args.p_tier = body.tier as VipTier;
  }
  if (action === "discount_set") {
    const pct = body.percent;
    if (
      typeof pct !== "number" ||
      !Number.isInteger(pct) ||
      pct < DISCOUNT_PERCENT_MIN ||
      pct > DISCOUNT_PERCENT_MAX
    ) {
      return fail("invalid_percent");
    }
    args.p_discount_percent = pct;
  }
  if (action === "vip_grant" || action === "discount_set") {
    const period = readPeriod(body, today);
    if (typeof period === "string") return fail(period);
    Object.assign(args, period);
  } else if (
    action === "vip_extend" ||
    action === "vip_shorten" ||
    action === "discount_extend" ||
    action === "discount_shorten"
  ) {
    const days = readDays(body.days);
    if (days === null) return fail("invalid_days");
    args.p_days = days;
  } else if (action === "vip_set_end" || action === "discount_set_end") {
    if (!isValidEndDate(body.endDate, today)) return fail("invalid_date");
    args.p_end_date = body.endDate as string;
  }
  return { ok: true, args };
}

export type CompanyRpcArgs = Common & {
  p_action: CompanyAction;
  p_org_ids: string[];
  p_tier?: CompanyPlanTier;
  p_days?: number;
  p_end_date?: string;
};

export function parseCompanyChange(
  input: unknown,
  today: string,
): Parsed<CompanyRpcArgs> {
  const body = asBody(input);
  if (!body) return fail("invalid_request");
  const action = body.action as CompanyAction;
  if (!COMPANY_ACTIONS.includes(action)) return fail("invalid_action");
  const common = readCommon(body);
  if (typeof common === "string") return fail(common);
  const ids = readIds(body.orgIds);
  if (!ids) return fail("invalid_targets");
  const args: CompanyRpcArgs = { ...common, p_action: action, p_org_ids: ids };

  if (action === "grant" || action === "set_tier") {
    if (!COMPANY_PLAN_TIERS.includes(body.tier as CompanyPlanTier)) {
      return fail("invalid_tier");
    }
    args.p_tier = body.tier as CompanyPlanTier;
  }
  if (action === "grant") {
    const period = readPeriod(body, today);
    if (typeof period === "string") return fail(period);
    Object.assign(args, period);
  } else if (action === "extend" || action === "shorten") {
    const days = readDays(body.days);
    if (days === null) return fail("invalid_days");
    args.p_days = days;
  } else if (action === "set_end") {
    if (!isValidEndDate(body.endDate, today)) return fail("invalid_date");
    args.p_end_date = body.endDate as string;
  }
  return { ok: true, args };
}

// ---------------------------------------------------------------------------
// RPC result shape (the jsonb the three functions return)
// ---------------------------------------------------------------------------

export type ChangeRow = {
  target_id: string | null;
  outcome: "changed" | "skipped";
  reason: SkipReason | null;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  effects?: Record<string, unknown> | null;
  /** memberships */
  user_id?: string;
  display_name?: string | null;
  /** listings */
  kind?: "property" | "service";
  owner_id?: string | null;
  title?: string | null;
  /** companies */
  brand_name?: string | null;
};

export type ChangeResult = {
  applied: boolean;
  action: string;
  changed: number;
  skipped: number;
  rows: ChangeRow[];
};
