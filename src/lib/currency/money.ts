/**
 * Prices in lari or dollars (C55). Every price has its own currency: sale
 * listings are US dollars (C54), everything else is lari. A visitor may pick
 * one currency in the header's language menu; a price in the other currency
 * is then shown converted at the National Bank of Georgia's official rate for
 * the day. No usable NBG rate, no conversion: the price is printed in its own
 * currency, never through a constant.
 *
 * Pure on purpose (no imports, C29): scripts/unit/currency.test.mjs imports
 * it bare.
 */

export type CurrencyCode = "GEL" | "USD";

export function isCurrencyCode(value: unknown): value is CurrencyCode {
  return value === "GEL" || value === "USD";
}

/** NBG's official rate for one Tbilisi day: lari per US dollar. */
export interface UsdRate {
  gelPerUsd: number;
  /** The Tbilisi day (YYYY-MM-DD) the rate is the official one for. */
  date: string;
  /** NBG's validFromDate (YYYY-MM-DD): a weekend or Monday reuses Friday's fix. */
  validFrom: string;
}

// Lari per dollar has stayed between 1.3 and 3.5 since 2008: a value outside
// this band is a broken response, not a rate.
const PLAUSIBLE_GEL_PER_USD = { min: 1, max: 10 };

/** An NBG rate older than this (NBG down for days) is not used at all. */
export const RATE_MAX_AGE_DAYS = 3;

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 24 * 60 * 60 * 1000;

function plausible(gelPerUsd: unknown): gelPerUsd is number {
  return (
    typeof gelPerUsd === "number" &&
    Number.isFinite(gelPerUsd) &&
    gelPerUsd >= PLAUSIBLE_GEL_PER_USD.min &&
    gelPerUsd <= PLAUSIBLE_GEL_PER_USD.max
  );
}

/** Tbilisi's calendar day at `now`: Georgia is UTC+4 all year (no DST since 2005). */
export function tbilisiDay(now: Date): string {
  return new Date(now.getTime() + 4 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
}

/**
 * Reads NBG's `/currencies/<lang>/json/?currencies=USD&date=<day>` body: an
 * array whose entries list `{ code, quantity, rate, validFromDate }`. A
 * missing USD row, a non-positive quantity, a rate outside the plausible band
 * or a fix not yet valid on `day` gives null.
 */
export function parseNbgUsdRate(body: unknown, day: string): UsdRate | null {
  if (!ISO_DAY.test(day) || !Array.isArray(body)) return null;
  for (const entry of body) {
    const currencies = (entry as { currencies?: unknown } | null)?.currencies;
    if (!Array.isArray(currencies)) continue;
    for (const row of currencies) {
      if (!row || typeof row !== "object") continue;
      const { code, quantity, rate, validFromDate } = row as Record<
        string,
        unknown
      >;
      if (code !== "USD") continue;
      if (
        typeof quantity !== "number" ||
        !Number.isFinite(quantity) ||
        quantity <= 0 ||
        typeof rate !== "number"
      ) {
        return null;
      }
      const gelPerUsd = rate / quantity;
      const validFrom =
        typeof validFromDate === "string" ? validFromDate.slice(0, 10) : "";
      if (
        !plausible(gelPerUsd) ||
        !ISO_DAY.test(validFrom) ||
        validFrom > day
      ) {
        return null;
      }
      return { gelPerUsd, date: day, validFrom };
    }
  }
  return null;
}

/** A UsdRate as /api/fx/usd sends it (or a browser stored it), checked again. */
export function parseUsdRate(value: unknown): UsdRate | null {
  if (!value || typeof value !== "object") return null;
  const { gelPerUsd, date, validFrom } = value as Record<string, unknown>;
  if (
    !plausible(gelPerUsd) ||
    typeof date !== "string" ||
    !ISO_DAY.test(date) ||
    typeof validFrom !== "string" ||
    !ISO_DAY.test(validFrom)
  ) {
    return null;
  }
  return { gelPerUsd, date, validFrom };
}

/** True when `rate` may convert prices on the Tbilisi day `today`. */
export function isUsableRate(
  rate: UsdRate | null | undefined,
  today: string,
): rate is UsdRate {
  if (!rate || !plausible(rate.gelPerUsd) || !ISO_DAY.test(today)) return false;
  if (!ISO_DAY.test(rate.date)) return false;
  const ageDays = (Date.parse(today) - Date.parse(rate.date)) / DAY_MS;
  return Math.abs(ageDays) <= RATE_MAX_AGE_DAYS;
}

/** `amount` of `from` expressed in `to`, at `gelPerUsd` lari per dollar. */
export function convertAmount(
  amount: number,
  from: CurrencyCode,
  to: CurrencyCode,
  gelPerUsd: number,
): number {
  if (from === to) return amount;
  return from === "USD" ? amount * gelPerUsd : amount / gelPerUsd;
}

/**
 * A converted price as text: whole units grouped by a plain space (like
 * formatNumber in utils/format), or cents below 10 so a 2.50 ₾ coffee does not
 * read "$1" (`whole` skips the cents, for the edges of a price bucket). Lari
 * after the number ("46 ₾"), the dollar sign before it ("$46").
 */
export function formatConvertedAmount(
  amount: number,
  currency: CurrencyCode,
  whole = false,
): string {
  const cents = Math.round(amount * 100) / 100;
  const text =
    !whole && Math.abs(cents) < 10
      ? cents.toFixed(2)
      : String(Math.round(amount)).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return currency === "GEL" ? `${text} ₾` : `$${text}`;
}

/**
 * What a price of `amount` (in `from`) reads once the visitor picked
 * `display`, or null when it stays in its own currency: nothing picked, the
 * same currency, no amount (non-finite, zero or less: "no price", which keeps
 * its own text), or no usable rate for `today`.
 */
export function convertedPriceText(
  amount: number,
  from: CurrencyCode,
  display: CurrencyCode | null,
  rate: UsdRate | null | undefined,
  today: string,
  whole = false,
): string | null {
  if (
    display === null ||
    display === from ||
    !Number.isFinite(amount) ||
    amount <= 0
  ) {
    return null;
  }
  if (!isUsableRate(rate, today)) return null;
  const value = convertAmount(amount, from, display, rate.gelPerUsd);
  // Too small to show in the other currency ("$0.00"): keep its own text.
  if (Math.round(Math.abs(value) * (whole ? 1 : 100)) === 0) return null;
  return formatConvertedAmount(value, display, whole);
}

/** The rate as NBG publishes it: four decimals ("2.5971"). */
export function formatGelPerUsd(gelPerUsd: number): string {
  return gelPerUsd.toFixed(4);
}

/** "2026-10-26" → "26.10.2026". */
export function formatRateDay(day: string): string {
  return ISO_DAY.test(day)
    ? `${day.slice(8, 10)}.${day.slice(5, 7)}.${day.slice(0, 4)}`
    : day;
}
