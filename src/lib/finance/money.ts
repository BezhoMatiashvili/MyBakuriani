// Money arithmetic for the finance module (C42). No imports: scripts/unit
// loads this file directly with Node's type stripping.
//
// Amounts are GEL with 2 decimals. Postgres numeric round() is exact and
// rounds half away from zero; binary floats are not exact (2.5 * 0.29 is
// 0.72499…), so anything the database also computes is done here in integer
// units with BigInt and only converted back at the end.

function shift(value: number, places: number): number {
  const [mantissa, exponent = "0"] = String(value).split("e");
  return Number(`${mantissa}e${Number(exponent) + places}`);
}

/** Round to 2 decimals, half away from zero (Postgres numeric round). */
export function roundMoney(value: number): number {
  if (!Number.isFinite(value)) return Number.NaN;
  const sign = value < 0 ? -1 : 1;
  const rounded = shift(Math.round(shift(Math.abs(value), 2)), -2);
  return rounded === 0 ? 0 : sign * rounded;
}

/** Whole units of 10^-places for a value already known to fit them. */
function units(value: number, places: number): bigint {
  return BigInt(Math.round(shift(value, places)));
}

function fromCents(cents: bigint): number {
  return Number(cents) / 100;
}

/**
 * A money input from a form or request body: a number, or a string with a
 * dot or comma decimal and optional spaces. At most 2 decimals. Returns null
 * for anything else (including NaN, Infinity and empty strings).
 */
export function parseMoney(
  input: unknown,
  { allowNegative = false }: { allowNegative?: boolean } = {},
): number | null {
  let text: string;
  if (typeof input === "number") {
    if (!Number.isFinite(input)) return null;
    text = String(input);
  } else if (typeof input === "string") {
    text = input.replace(/[\s ]/g, "").replace(",", ".");
  } else {
    return null;
  }
  const pattern = allowNegative
    ? /^-?\d{1,9}(\.\d{1,2})?$/
    : /^\d{1,9}(\.\d{1,2})?$/;
  if (!pattern.test(text)) return null;
  const value = Number(text);
  return Number.isFinite(value) ? (value === 0 ? 0 : value) : null;
}

/** "1 234.50 ₾" — grouped like formatNumber, always 2 decimals. */
export function formatMoney(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "—";
  }
  const rounded = roundMoney(value);
  const [whole, fraction] = Math.abs(rounded).toFixed(2).split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return `${rounded < 0 ? "-" : ""}${grouped}.${fraction} ₾`;
}

/** "1.5%" style rate text without trailing zeros. */
export function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "—";
  }
  return `${Number(value.toFixed(2))}%`;
}

export type InvoiceLineInput = {
  description: string;
  quantity: number;
  unit_price: number;
};

export type PricedInvoice = {
  items: (InvoiceLineInput & { amount: number })[];
  subtotal: number;
  discount: number;
  vat: number;
  total: number;
};

/**
 * Prices an invoice exactly like public.invoices_guard(): each line is
 * round(quantity * unit_price, 2), VAT is round((subtotal - discount) *
 * rate / 100, 2) added on top, and the total is base + VAT. Inputs must
 * already be valid (quantity > 0 with <= 3 decimals, prices >= 0 with
 * <= 2 decimals, 0 <= discount <= subtotal); the database stays the authority.
 */
export function priceInvoice(
  items: readonly InvoiceLineInput[],
  discountAmount: number,
  vatRate: number | null,
): PricedInvoice {
  const priced = items.map((item) => {
    // 10^-3 quantity units x 10^-2 price units = 10^-5 GEL; half up to cents.
    const raw = units(item.quantity, 3) * units(item.unit_price, 2);
    const cents = (raw + BigInt(500)) / BigInt(1000);
    return { ...item, cents };
  });
  const subtotalCents = priced.reduce(
    (sum, item) => sum + item.cents,
    BigInt(0),
  );
  const discountCents = units(discountAmount, 2);
  const baseCents = subtotalCents - discountCents;
  const vatCents =
    vatRate === null || baseCents <= BigInt(0)
      ? BigInt(0)
      : (baseCents * units(vatRate, 2) + BigInt(5000)) / BigInt(10000);
  return {
    items: priced.map(({ cents, ...item }) => ({
      ...item,
      amount: fromCents(cents),
    })),
    subtotal: fromCents(subtotalCents),
    discount: fromCents(discountCents),
    vat: fromCents(vatCents),
    total: fromCents(baseCents + vatCents),
  };
}

/** What-if estimate for the tax calculator: base x rate %, rounded. */
export function estimateTax(base: number, ratePercent: number): number {
  return roundMoney((base * ratePercent) / 100);
}

export type ThresholdLevel = "ok" | "warning" | "exceeded";

/**
 * Where an amount stands against a threshold (small-business or VAT): the
 * share used, what is left, and a level that turns to "warning" at
 * warnPercent and "exceeded" past the threshold.
 */
export function thresholdStatus(
  amount: number,
  threshold: number,
  warnPercent: number,
): { percent: number; remaining: number; level: ThresholdLevel } {
  const percent = threshold > 0 ? (amount / threshold) * 100 : 0;
  const level: ThresholdLevel =
    amount > threshold ? "exceeded" : percent >= warnPercent ? "warning" : "ok";
  return {
    percent: Math.round(percent * 10) / 10,
    remaining: roundMoney(Math.max(threshold - amount, 0)),
    level,
  };
}
