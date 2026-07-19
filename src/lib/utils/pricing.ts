import { addDays, differenceInCalendarDays, format } from "date-fns";

export interface PriceOverride {
  date: string;
  price: number;
}

export function buildOverrideMap(
  overrides: PriceOverride[] | undefined | null,
): Map<string, number> {
  const map = new Map<string, number>();
  if (!overrides) return map;
  for (const o of overrides) map.set(o.date, Number(o.price));
  return map;
}

/**
 * Sum per-day prices across [start, end] INCLUSIVE — every selected calendar
 * day is billed, including the check-out day (no same-day turnover). Uses the
 * override price when present, otherwise falls back to basePrice.
 *
 * Examples: start === end → 1 day's price; 2026-06-28 → 2026-06-30 → 3 days
 * (28, 29, 30). Returns 0 for an invalid range (end strictly before start).
 */
export function sumNightlyPrice(
  start: Date,
  end: Date,
  basePrice: number,
  overrides?: PriceOverride[] | null,
): number {
  const days = differenceInCalendarDays(end, start) + 1;
  if (days <= 0) return 0;
  const map = buildOverrideMap(overrides);
  let total = 0;
  for (let i = 0; i < days; i += 1) {
    const day = addDays(start, i);
    const key = format(day, "yyyy-MM-dd");
    total += map.get(key) ?? basePrice;
  }
  return total;
}

// Null discountExpiresAt is treated as active (fail-open) to match how the purchase_package RPC writes these columns, and the strict '>' matches the DB's create_booking check.
export function isDiscountActive(
  discountPercent: number | null | undefined,
  discountExpiresAt: string | null | undefined,
): boolean {
  if (!discountPercent || discountPercent <= 0) return false;
  if (!discountExpiresAt) return true;
  return new Date(discountExpiresAt).getTime() > Date.now();
}

// Return value is deliberately unrounded (callers round at render time; this keeps "discount applied once to a summed subtotal" mathematically identical to "discount applied per-night then summed").
export function applyDiscount(
  price: number,
  discountPercent: number | null | undefined,
  discountExpiresAt: string | null | undefined,
): number {
  if (!isDiscountActive(discountPercent, discountExpiresAt)) return price;
  if (price <= 0) return price;
  return price * (1 - (discountPercent as number) / 100);
}
