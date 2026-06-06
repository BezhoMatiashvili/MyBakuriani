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
