/**
 * Seasonal renter membership — 2026 price list §1: Summer (April–October) and
 * Winter (November–March); 30 ₾ for "our Facebook group VIP member"
 * (self-declared, verified by an admin before activation) and 60 ₾ for every
 * other user. Season windows are computed only in SQL
 * (renter_membership_season_window / renter_membership_plans); this module is
 * the shared vocabulary plus the pure predicates the dashboard, the rental
 * create form and the admin API use. No `@/` imports: scripts/unit imports it.
 */
export const MEMBERSHIP_SEASONS = ["summer", "winter"] as const;
export type MembershipSeason = (typeof MEMBERSHIP_SEASONS)[number];

export const MEMBERSHIP_PRICE_TIERS = ["fb_group_vip", "standard"] as const;
export type MembershipPriceTier = (typeof MEMBERSHIP_PRICE_TIERS)[number];

/** [month, day] bounds; each renter package's meta must match its season. */
export const SEASON_BOUNDS: Record<
  MembershipSeason,
  { start: readonly [number, number]; end: readonly [number, number] }
> = {
  summer: { start: [4, 1], end: [10, 31] },
  winter: { start: [11, 1], end: [3, 31] },
};

/** Write-boundary check for renter package meta; other meta returns null. */
export function validateRenterMembershipMeta(
  meta: Record<string, unknown>,
): string | null {
  if (meta.subscription_scope !== "renter") return null;
  if (meta.billing_period !== "seasonal") {
    return "renter membership must be seasonal";
  }
  const season = meta.season as MembershipSeason;
  if (!MEMBERSHIP_SEASONS.includes(season)) {
    return "renter membership season must be summer or winter";
  }
  if (
    !MEMBERSHIP_PRICE_TIERS.includes(meta.price_tier as MembershipPriceTier)
  ) {
    return "renter membership price_tier must be fb_group_vip or standard";
  }
  const { start, end } = SEASON_BOUNDS[season];
  if (
    meta.season_start_month !== start[0] ||
    meta.season_start_day !== start[1] ||
    meta.season_end_month !== end[0] ||
    meta.season_end_day !== end[1]
  ) {
    return `renter membership ${season} season must run ${start[1]}.${start[0]} – ${end[1]}.${end[0]}`;
  }
  return null;
}

export type MembershipWindow = { startsAt: string; expiresAt: string };
export type MembershipRow = {
  status: string;
  starts_at: string;
  expires_at: string;
};

export type MembershipState = {
  /** Latest expiry among memberships active right now (the posting gate). */
  activeUntil: string | null;
  /** Earliest approved membership that starts later (a pre-bought season). */
  upcoming: MembershipWindow | null;
  /** The paid request awaiting admin review, if any. */
  pending: MembershipWindow | null;
  /** Remaining windows already covered by active or pending memberships. */
  covered: MembershipWindow[];
};

const toMs = (iso: string) => Date.parse(iso);

/** Mirrors the SQL gate: active AND starts_at <= now AND expires_at > now. */
export function isMembershipActiveAt(
  row: MembershipRow,
  nowMs: number,
): boolean {
  return (
    row.status === "active" &&
    toMs(row.starts_at) <= nowMs &&
    toMs(row.expires_at) > nowMs
  );
}

/** Half-open overlap on parsed instants (never compare ISO strings). */
export function windowsOverlap(
  a: MembershipWindow,
  b: MembershipWindow,
): boolean {
  return (
    toMs(a.startsAt) < toMs(b.expiresAt) && toMs(b.startsAt) < toMs(a.expiresAt)
  );
}

/** HINT raised by the properties_require_rental_membership trigger. */
export const RENTAL_MEMBERSHIP_REQUIRED_HINT = "RENTAL_MEMBERSHIP_REQUIRED";

export function isRentalMembershipRequiredError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    (err as { hint?: unknown }).hint === RENTAL_MEMBERSHIP_REQUIRED_HINT
  );
}

export type RentalPostingGate = "allowed" | "pending" | "upcoming" | "missing";

/** What the rental create form shows up front; the DB trigger stays the authority. */
export function rentalPostingGate(state: MembershipState): RentalPostingGate {
  if (state.activeUntil) return "allowed";
  if (state.pending) return "pending";
  if (state.upcoming) return "upcoming";
  return "missing";
}

export function deriveMembershipState(
  rows: readonly MembershipRow[],
  nowMs: number,
): MembershipState {
  let activeUntil: string | null = null;
  let upcoming: MembershipWindow | null = null;
  let pending: MembershipWindow | null = null;
  const covered: MembershipWindow[] = [];
  for (const row of rows) {
    if (toMs(row.expires_at) <= nowMs) continue;
    const window = { startsAt: row.starts_at, expiresAt: row.expires_at };
    if (row.status === "pending_approval") {
      pending = window;
      covered.push(window);
      continue;
    }
    if (row.status !== "active") continue;
    covered.push(window);
    if (isMembershipActiveAt(row, nowMs)) {
      if (!activeUntil || toMs(row.expires_at) > toMs(activeUntil)) {
        activeUntil = row.expires_at;
      }
    } else if (!upcoming || toMs(row.starts_at) < toMs(upcoming.startsAt)) {
      upcoming = window;
    }
  }
  return { activeUntil, upcoming, pending, covered };
}
