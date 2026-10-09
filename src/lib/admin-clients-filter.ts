// Filters of the admin clients directory (/dashboard/admin/clients).
// Pure (no "@/" import): scripts/unit/admin-clients-filter.test.mjs loads it
// bare. The facts each row carries come from GET /api/admin/clients:
//   membership_state = admin_membership_overview_v.state (C44)
//   vip_tier         = the best active admin_listing_promotions_v.vip_tier of
//                      the user's listings ("super" over "vip"; C23/C44)
//   company_state    = the best admin_company_plans_v.state of the companies
//                      the user owns (null = owns none)
//   last_sign_in_at  = auth.users.last_sign_in_at: a sign-in, not a token
//                      refresh, so a user who stays signed in keeps an old date
//   registered_on    = profiles.created_at as a Tbilisi calendar date

export const CLIENT_FILTER_KEYS = [
  "role",
  "membership",
  "vip",
  "company",
  "seen",
  "method",
  "balance",
  "verified",
  "from",
  "to",
] as const;
export type ClientFilterKey = (typeof CLIENT_FILTER_KEYS)[number];
export type ClientFilters = Partial<Record<ClientFilterKey, string>>;

/** Last sign-in: within N days, not for N+ days, or never. */
export const SEEN_FILTERS = [
  "7",
  "30",
  "90",
  "over30",
  "over90",
  "never",
] as const;
export const SIGN_IN_METHODS = ["email", "google", "phone"] as const;
export const BALANCE_FILTERS = ["positive", "zero"] as const;
export const VERIFIED_FILTERS = ["yes", "no"] as const;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;

/** The allowed values of every key but the two dates. */
export type ClientFilterOptions = Record<
  Exclude<ClientFilterKey, "from" | "to">,
  readonly string[]
>;

/** The fields the filters read; the page's rows carry more. */
export type ClientFactsRow = {
  role: string;
  is_verified: boolean | null;
  balance_amount: number;
  registered_on?: string | null;
  last_sign_in_at?: string | null;
  sign_in_methods?: readonly string[] | null;
  membership_state?: string | null;
  vip_tier?: string | null;
  company_state?: string | null;
};

/** The URL's filters, keeping only known values and real dates. */
export function parseClientFilters(
  get: (key: string) => string | null | undefined,
  options: ClientFilterOptions,
): ClientFilters {
  const out: ClientFilters = {};
  for (const key of CLIENT_FILTER_KEYS) {
    const value = get(key)?.trim();
    if (!value) continue;
    if (key === "from" || key === "to") {
      if (isRealDate(value)) out[key] = value;
    } else if (options[key].includes(value)) {
      out[key] = value;
    }
  }
  return out;
}

/** How many filters are set (the date range counts once). */
export function activeFilterCount(filters: ClientFilters): number {
  let count = 0;
  for (const key of CLIENT_FILTER_KEYS) {
    if (key === "to" && filters.from) continue;
    if (filters[key]) count += 1;
  }
  return count;
}

/** Whether a client passes every set filter. */
export function matchesClientFilters(
  row: ClientFactsRow,
  filters: ClientFilters,
  now: number,
): boolean {
  if (filters.role && row.role !== filters.role) return false;
  if (
    filters.membership &&
    (row.membership_state ?? "none") !== filters.membership
  ) {
    return false;
  }
  if (filters.vip) {
    const tier = row.vip_tier ?? null;
    const ok =
      filters.vip === "any"
        ? tier !== null
        : filters.vip === "none"
          ? tier === null
          : tier === filters.vip;
    if (!ok) return false;
  }
  if (filters.company) {
    const state = row.company_state ?? null;
    const ok =
      filters.company === "any" ? state !== null : state === filters.company;
    if (!ok) return false;
  }
  if (
    filters.seen &&
    !matchesSeen(row.last_sign_in_at ?? null, filters.seen, now)
  ) {
    return false;
  }
  if (filters.method && !(row.sign_in_methods ?? []).includes(filters.method)) {
    return false;
  }
  if (filters.balance) {
    const positive = Number(row.balance_amount) > 0;
    if (filters.balance === "positive" ? !positive : positive) return false;
  }
  if (filters.verified) {
    const verified = row.is_verified === true;
    if (filters.verified === "yes" ? !verified : verified) return false;
  }
  if (filters.from || filters.to) {
    const day = row.registered_on ?? "";
    if (!day) return false;
    if (filters.from && day < filters.from) return false;
    if (filters.to && day > filters.to) return false;
  }
  return true;
}

/** Rows that would match with `key` set to `value` (the option counts). */
export function countWithOption(
  rows: readonly ClientFactsRow[],
  filters: ClientFilters,
  key: ClientFilterKey,
  value: string,
  now: number,
): number {
  const next = { ...filters, [key]: value };
  let count = 0;
  for (const row of rows) {
    if (matchesClientFilters(row, next, now)) count += 1;
  }
  return count;
}

function matchesSeen(lastSignIn: string | null, seen: string, now: number) {
  if (seen === "never") return !lastSignIn;
  if (!lastSignIn) return false;
  const age = now - Date.parse(lastSignIn);
  if (seen.startsWith("over")) return age >= Number(seen.slice(4)) * DAY_MS;
  return age < Number(seen) * DAY_MS;
}

function isRealDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return (
    date.getUTCFullYear() === y &&
    date.getUTCMonth() === m - 1 &&
    date.getUTCDate() === d
  );
}
