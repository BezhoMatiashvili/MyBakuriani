/**
 * Public listing numbers (C61): every property and service gets one 8-digit ID
 * from a single counter shared by both tables (first = 10000001), assigned and
 * frozen by the DB trigger `listing_number_guard`. Shown as "ID: 10000042".
 *
 * Pure (no `@/` imports): unit-tested from scripts/unit/listing-number.test.mjs.
 */

export const FIRST_LISTING_NUMBER = 10000001;

// "10000042", "ID: 10000042", "id10000042", "#10000042", "№ 10000042".
const LISTING_NUMBER_QUERY = /^(?:id\s*[:#№]?|[#№])?\s*(\d{8})$/i;

/** The listing number a search box query names, or null if it is not one. */
export function parseListingNumber(
  query: string | null | undefined,
): number | null {
  if (typeof query !== "string") return null;
  const match = LISTING_NUMBER_QUERY.exec(query.trim());
  if (!match) return null;
  const n = Number(match[1]);
  return n >= FIRST_LISTING_NUMBER ? n : null;
}
