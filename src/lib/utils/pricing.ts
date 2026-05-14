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
 * Sum nightly prices across [start, end) — end is exclusive, matching booking
 * convention where check-out day is not billed. Uses the override price when
 * present, otherwise falls back to basePrice.
 */
export function sumNightlyPrice(
  start: Date,
  end: Date,
  basePrice: number,
  overrides?: PriceOverride[] | null,
): number {
  const nights = differenceInCalendarDays(end, start);
  if (nights <= 0) return 0;
  const map = buildOverrideMap(overrides);
  let total = 0;
  for (let i = 0; i < nights; i += 1) {
    const day = addDays(start, i);
    const key = format(day, "yyyy-MM-dd");
    total += map.get(key) ?? basePrice;
  }
  return total;
}
