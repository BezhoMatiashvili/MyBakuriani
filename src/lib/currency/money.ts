/**
 * Prices in lari or dollars (C55). Every price has its own currency: a sale
 * is in the currency its seller typed, with the other one stored beside it
 * (C54), everything else is lari. A visitor may pick one currency in the
 * header's language menu; a price in the other currency is then shown
 * converted at the National Bank of Georgia's official rate for the day (a
 * sale shows its other stored number instead). No usable NBG rate, no
 * conversion: the price is printed in its own currency, never through a
 * constant.
 *
 * Pure on purpose (no imports, C29): scripts/unit/currency.test.mjs imports
 * it bare.
 */

/** The price currencies; = the CHECK properties_sale_price_currency_check (C54). */
export const CURRENCY_CODES = ["GEL", "USD"] as const;

export type CurrencyCode = (typeof CURRENCY_CODES)[number];

export function isCurrencyCode(value: unknown): value is CurrencyCode {
  return (CURRENCY_CODES as readonly unknown[]).includes(value);
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

/**
 * A sale's stored pair is plausible while its lari lie between `min` and
 * `max` times its dollars: the CHECK properties_sale_price_pair_plausible
 * (check-contracts C54 compares the numbers). A sanity band, not a rate: it
 * stops a dollar figure (what sorting and the filters read) far from the lari
 * figure visitors see. A rate outside it counts as no rate for a sale.
 */
export const SALE_PAIR_BAND = { min: 1.5, max: 4.5 } as const;

/** The price columns of a sale row (properties, public_properties). */
export interface SalePriceRow {
  /** US dollars: what sorting, the sale filters and Baku's budget read. */
  sale_price: number | null;
  /** The lari amount; null on a legacy dollar-only row. */
  sale_price_gel: number | null;
  /** The currency the seller typed ("USD" | "GEL"); read only by salePrice. */
  sale_price_currency: string | null;
}

/** A sale's stored price: dollars, lari when stored, its seller's currency. */
export interface SalePrice {
  usd: number;
  gel: number | null;
  own: CurrencyCode;
}

/** The stored number a sale shows for a currency pick. */
export interface ShownSalePrice {
  amount: number;
  currency: CurrencyCode;
  /** A legacy dollar-only row under a ₾ pick: `amount` is its dollars, for
   * the caller to convert at today's rate (if it has one). */
  live: boolean;
}

/** The three sale price columns the sale form saves. */
export interface SalePriceColumns {
  sale_price: number;
  sale_price_gel: number | null;
  sale_price_currency: CurrencyCode;
}

/** salePriceToSave's refusal: a lari price without a usable rate, or no
 * plausible price. */
export interface SalePriceRefusal {
  error: "no_rate" | "invalid";
}

function positiveAmount(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : null;
}

function saleRate(gelPerUsd: number | null | undefined): number | null {
  return typeof gelPerUsd === "number" &&
    gelPerUsd >= SALE_PAIR_BAND.min &&
    gelPerUsd <= SALE_PAIR_BAND.max
    ? gelPerUsd
    : null;
}

function plausiblePair(usd: number, gel: number | null): boolean {
  return (
    gel === null ||
    (gel >= SALE_PAIR_BAND.min * usd && gel <= SALE_PAIR_BAND.max * usd)
  );
}

/**
 * A sale row's stored price, or null when it has no dollar price. The only
 * reader of sale_price_currency: the seller's currency is "GEL" only when a
 * lari amount is stored with it.
 */
export function salePrice(row: SalePriceRow): SalePrice | null {
  const usd = positiveAmount(row.sale_price);
  if (usd === null) return null;
  const gel = positiveAmount(row.sale_price_gel);
  return {
    usd,
    gel,
    own: gel !== null && row.sale_price_currency === "GEL" ? "GEL" : "USD",
  };
}

/**
 * What a sale shows for the visitor's pick, never a conversion: its own
 * amount with no pick (the server and hydration) or a pick of its own
 * currency, otherwise the other stored number. A legacy row (no lari) under a
 * ₾ pick shows its dollars with `live` set.
 */
export function salePriceShown(
  price: SalePrice,
  pick: CurrencyCode | null,
): ShownSalePrice {
  if ((pick ?? price.own) === "USD") {
    return { amount: price.usd, currency: "USD", live: false };
  }
  if (price.gel !== null) {
    return { amount: price.gel, currency: "GEL", live: false };
  }
  return { amount: price.usd, currency: "USD", live: true };
}

/**
 * A sale amount in the other currency at `gelPerUsd` lari per dollar, rounded
 * to `decimals` places (whole units for a price, cents for a price per m²),
 * or null for no amount or a rate outside SALE_PAIR_BAND.
 */
export function convertSaleAmount(
  amount: number,
  from: CurrencyCode,
  gelPerUsd: number,
  decimals = 0,
): number | null {
  const rate = saleRate(gelPerUsd);
  if (rate === null || positiveAmount(amount) === null) return null;
  const factor = 10 ** decimals;
  const to = from === "USD" ? "GEL" : "USD";
  return Math.round(convertAmount(amount, from, to, rate) * factor) / factor;
}

/**
 * What the sale form saves (C54). `pair` holds the field's number under the
 * chip's `currency` and at most the other stored number (an edit's loaded
 * counterpart, or a legacy row's one-off conversion); `gelPerUsd` is the
 * form's rate snapshot, null without one. The chip's number typed back as
 * loaded brings `loaded`'s other number with it, and a pair equal to `loaded`
 * (the edited row) goes back as loaded, under the chip's currency: a tap, a
 * typed-back price or an untouched edit never changes a saved price (a
 * re-converted counterpart would, and with the lari unchanged the pair
 * trigger would make the listing a dollar one). Otherwise the typed number is
 * kept exactly and the missing one is converted in whole units: lari without
 * a usable rate is refused (`no_rate`), dollars without one are saved without
 * lari. A rate outside SALE_PAIR_BAND counts as none and a pair outside it is
 * refused (`invalid`), so what the form saves always passes the CHECK. A new
 * dollar price whose converted lari equals the loaded lari is saved by that
 * trigger without lari (accepted: it then converts live, C54).
 */
export function salePriceToSave(
  pair: { usd: number | null; gel: number | null },
  currency: CurrencyCode,
  gelPerUsd: number | null,
  loaded: SalePriceRow | null,
): SalePriceColumns | SalePriceRefusal {
  let usd = positiveAmount(pair.usd);
  let gel = positiveAmount(pair.gel);
  const loadedUsd = loaded && positiveAmount(loaded.sale_price);
  const loadedGel = loaded && positiveAmount(loaded.sale_price_gel);
  if (currency === "GEL" && usd === null && gel !== null && gel === loadedGel)
    usd = loadedUsd;
  if (currency === "USD" && gel === null && usd !== null && usd === loadedUsd)
    gel = loadedGel;
  const asLoaded = loaded !== null && usd === loadedUsd && gel === loadedGel;
  const rate = saleRate(gelPerUsd);
  if (usd === null && gel !== null) {
    if (rate === null) return { error: "no_rate" };
    usd = convertSaleAmount(gel, "GEL", rate);
  } else if (
    usd !== null &&
    gel === null &&
    (currency === "GEL" || !asLoaded)
  ) {
    if (rate !== null) gel = convertSaleAmount(usd, "USD", rate);
    else if (currency === "GEL") return { error: "no_rate" };
  }
  if (usd === null || !plausiblePair(usd, gel)) return { error: "invalid" };
  return {
    sale_price: usd,
    sale_price_gel: gel,
    sale_price_currency: currency,
  };
}
