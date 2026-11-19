/**
 * Public listing numbers (C61): every property and service gets one 8-digit ID
 * from a single counter shared by both tables (first = 10000001), assigned and
 * frozen by the DB trigger `listing_number_guard`. Shown as "ID: 10000042".
 *
 * Pure (no `@/` imports): unit-tested from scripts/unit/listing-number.test.mjs.
 */

export const FIRST_LISTING_NUMBER = 10000001;

// The optional lead-in before the digits: "ID:", "id", "ID#", "#", "№".
const LISTING_ID_PREFIX = /^(?:id\s*[:#№]?|[#№])\s*/i;

/** The query without its "ID:" / "#" / "№" lead-in (for partial ID matching). */
export function stripListingIdPrefix(query: string): string {
  return query.trim().replace(LISTING_ID_PREFIX, "");
}

/** The listing number a search box query names, or null if it is not one. */
export function parseListingNumber(
  query: string | null | undefined,
): number | null {
  if (typeof query !== "string") return null;
  const digits = stripListingIdPrefix(query);
  if (!/^\d{8}$/.test(digits)) return null;
  const n = Number(digits);
  return n >= FIRST_LISTING_NUMBER ? n : null;
}
