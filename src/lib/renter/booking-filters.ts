// Quick filters for the renter calendar's booking list. Pure (no `@/`
// imports) so scripts/unit/booking-filters.test.mjs can load it directly.
//
// A manual booking occupies its check-out day too (no back-to-back stays), so
// a stay is "current" through its check-out date inclusive.

export const BOOKING_FILTERS = [
  "current",
  "upcoming",
  "past",
  "recent",
  "cancelled",
] as const;

export type BookingFilter = (typeof BOOKING_FILTERS)[number];

export interface FilterableBooking {
  check_in: string;
  check_out: string;
  status: string;
  created_at: string | null;
  cancelled_at: string | null;
  guest_name: string | null;
  guest_phone: string | null;
}

function matchesFilter(
  b: FilterableBooking,
  filter: BookingFilter,
  todayIso: string,
): boolean {
  const cancelled = b.status === "cancelled";
  if (filter === "cancelled") return cancelled;
  if (cancelled) return false;
  switch (filter) {
    case "current":
      return b.check_in <= todayIso && b.check_out >= todayIso;
    case "upcoming":
      return b.check_in > todayIso;
    case "past":
      return b.check_out < todayIso;
    case "recent":
      return true;
  }
}

// Newest first; a missing timestamp sorts last.
function byTimestampDesc(a: string | null, b: string | null): number {
  if (a === b) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return a < b ? 1 : -1;
}

function compareFor(filter: BookingFilter) {
  return (a: FilterableBooking, b: FilterableBooking): number => {
    switch (filter) {
      case "current":
        return a.check_out.localeCompare(b.check_out);
      case "upcoming":
        return a.check_in.localeCompare(b.check_in);
      case "past":
        return b.check_out.localeCompare(a.check_out);
      case "recent":
        return byTimestampDesc(a.created_at, b.created_at);
      case "cancelled":
        return byTimestampDesc(a.cancelled_at, b.cancelled_at);
    }
  };
}

function matchesQuery(b: FilterableBooking, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  if (b.guest_name?.toLowerCase().includes(q)) return true;
  const digits = q.replace(/\D/g, "");
  return Boolean(digits && b.guest_phone?.replace(/\D/g, "").includes(digits));
}

export function filterBookings<T extends FilterableBooking>(
  bookings: readonly T[],
  filter: BookingFilter,
  todayIso: string,
  query = "",
): T[] {
  return bookings
    .filter((b) => matchesFilter(b, filter, todayIso) && matchesQuery(b, query))
    .sort(compareFor(filter));
}

export function countBookings(
  bookings: readonly FilterableBooking[],
  todayIso: string,
  query = "",
): Record<BookingFilter, number> {
  const counts = Object.fromEntries(
    BOOKING_FILTERS.map((f) => [f, 0]),
  ) as Record<BookingFilter, number>;
  for (const b of bookings) {
    if (!matchesQuery(b, query)) continue;
    for (const f of BOOKING_FILTERS) {
      if (matchesFilter(b, f, todayIso)) counts[f] += 1;
    }
  }
  return counts;
}
