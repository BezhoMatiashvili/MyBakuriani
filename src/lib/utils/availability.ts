// Shared helpers for availability/calendar windows.
// Weekend definition matches dashboard/renter convention (Fri–Sun for ski-resort tourist days).
// See PriceRangeModal and dashboard/renter/calendar/page.tsx — keep in sync.

export type AvailabilityStatus = "available" | "blocked";

// Mon-indexed weekday numbers treated as "weekend" for this resort.
export const WEEKEND_MON_INDICES: ReadonlySet<number> = new Set([4, 5, 6]);

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

export function isoDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// JS getDay(): Sun=0, Mon=1 … Sat=6 → convert to Mon-indexed (Mon=0 … Sun=6)
export function monIndex(d: Date): number {
  return (d.getDay() + 6) % 7;
}

export function isWeekend(d: Date): boolean {
  return WEEKEND_MON_INDICES.has(monIndex(d));
}

// ISO date strings for [today, today + count - 1], local time.
export function buildNextNDays(
  count: number,
  from: Date = new Date(),
): string[] {
  const start = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    out.push(isoDate(d));
  }
  return out;
}

export const buildNext30Days = (from?: Date): string[] =>
  buildNextNDays(30, from);

export function parseIsoDate(iso: string): Date {
  return new Date(`${iso}T00:00:00`);
}

// Inclusive list of ISO dates between two ISO dates (order-independent).
// ISO yyyy-mm-dd strings sort chronologically, so the smaller string is the start.
export function datesInRange(a: string, b: string): string[] {
  const [from, to] = a <= b ? [a, b] : [b, a];
  const out: string[] = [];
  const cur = parseIsoDate(from);
  const end = parseIsoDate(to);
  while (cur <= end) {
    out.push(isoDate(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

// How far around today an occupancy read reaches. Wider than any calendar month
// on purpose: the booking pickers let the owner browse to any month, and a
// month-scoped read would render occupied nights as free the moment they do.
// Shared so the calendar page and the guests form can't drift apart.
export const OCCUPANCY_MONTHS_BACK = 3;
export const OCCUPANCY_MONTHS_AHEAD = 24;

/** [from, to] ISO bounds of the occupancy window around today. */
export function occupancyWindow(from: Date = new Date()): [string, string] {
  const y = from.getFullYear();
  const m = from.getMonth();
  return [
    isoDate(new Date(y, m - OCCUPANCY_MONTHS_BACK, 1)),
    isoDate(new Date(y, m + OCCUPANCY_MONTHS_AHEAD, 0)),
  ];
}

// Why a night can't be booked: a real stay, or a day the owner turned off.
// Mirrors the `booked` / `blocked` members of the DB `calendar_status` enum —
// `available` days are simply absent from an OccupiedMap.
export type OccupiedMap = ReadonlyMap<string, "booked" | "blocked">;

// The first occupied day strictly after `fromIso`, or null if none.
// Used to cap a check-out picker so a selected range can never straddle an
// occupied block — the manual-booking RPCs reject the whole span, not just its
// endpoints, so capping here is what keeps the UI and the server in agreement.
export function nextOccupiedAfter(
  occupied: OccupiedMap | undefined,
  fromIso: string,
): string | null {
  if (!occupied || occupied.size === 0 || !fromIso) return null;
  let found: string | null = null;
  for (const date of occupied.keys()) {
    if (date <= fromIso) continue;
    if (found === null || date < found) found = date;
  }
  return found;
}

// The ISO date one day before `iso`.
export function previousIsoDate(iso: string): string {
  const d = parseIsoDate(iso);
  d.setDate(d.getDate() - 1);
  return isoDate(d);
}

// The manual-booking RPCs raise a Georgian "…დაკავებულია" on a date conflict.
// Every caller must map it to the translated `datesUnavailable` copy rather than
// a generic retry message, or the owner is told the wrong thing.
export function isDateConflictError(
  message: string | null | undefined,
): boolean {
  return Boolean(message?.includes("დაკავებულია"));
}

// What a manual-booking write can fail with, as a translatable code.
export type BookingErrorCode = "datesUnavailable" | "generic";

export function mapBookingError(
  message: string | null | undefined,
): BookingErrorCode {
  return isDateConflictError(message) ? "datesUnavailable" : "generic";
}
