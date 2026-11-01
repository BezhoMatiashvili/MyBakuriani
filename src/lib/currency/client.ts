"use client";

import { useEffect, useMemo, useSyncExternalStore } from "react";
import { formatInCurrency } from "@/lib/utils/format";
import { applyDiscount, isDiscountActive } from "@/lib/utils/pricing";
import {
  convertedPriceText,
  isCurrencyCode,
  isUsableRate,
  parseUsdRate,
  salePrice,
  salePriceShown,
  tbilisiDay,
  type CurrencyCode,
  type SalePriceRow,
  type UsdRate,
} from "./money";

// The visitor's pick (C55): "GEL" or "USD"; no value = every price in its own
// currency. Kept in this browser only: public pages are cookie-free ISR (C28),
// so the server renders every price in its own currency and the pick applies
// right after hydration (the server snapshot below is always null).
export const CURRENCY_KEY = "mybakuriani:currency";
// The last rate this browser got from /api/fx/usd, and when.
const RATE_KEY = "mybakuriani:fx_usd";
const CHANGE_EVENT = "mybakuriani:currency-change";
const REFRESH_MS = 60 * 60 * 1000;
const RETRY_MS = 5 * 60 * 1000;

// Storage can throw (private mode, blocked site data, a full quota): the pick
// then lasts for this page view only.
let memoryCurrency: CurrencyCode | null = null;
let pickInMemory = false;
// undefined = storage not read yet.
let rateEntry: { rate: UsdRate; fetchedAt: number } | null | undefined;
let lastAttemptAt = 0;
let inFlight: Promise<UsdRate | null> | null = null;
let retryTimer: ReturnType<typeof setTimeout> | null = null;

function readCurrency(): CurrencyCode | null {
  if (pickInMemory) return memoryCurrency;
  try {
    const value = window.localStorage.getItem(CURRENCY_KEY);
    return isCurrencyCode(value) ? value : null;
  } catch {
    return memoryCurrency;
  }
}

function readRateEntry(): { rate: UsdRate; fetchedAt: number } | null {
  if (rateEntry === undefined) {
    rateEntry = null;
    try {
      const raw = window.localStorage.getItem(RATE_KEY);
      const stored = raw ? (JSON.parse(raw) as { fetchedAt?: unknown }) : null;
      const rate = parseUsdRate(stored);
      if (rate && typeof stored?.fetchedAt === "number") {
        rateEntry = { rate, fetchedAt: stored.fetchedAt };
      }
    } catch {
      // Unreadable: a fresh rate is fetched instead.
    }
  }
  return rateEntry;
}

function readRate(): UsdRate | null {
  return readRateEntry()?.rate ?? null;
}

const serverSnapshot = () => null;

function subscribe(onChange: () => void): () => void {
  const onStorage = (event: StorageEvent) => {
    if (event.key === RATE_KEY || event.key === null) rateEntry = undefined;
    if (
      event.key === CURRENCY_KEY ||
      event.key === RATE_KEY ||
      event.key === null
    ) {
      onChange();
    }
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

/**
 * Fetches today's NBG rate unless this browser already holds a fresh one, and
 * resolves to the rate the browser then holds (null: none). That rate may be
 * up to RATE_MAX_AGE_DAYS old while NBG is down, so a caller checks
 * isUsableRate. `force` skips the wait after a failed attempt (a pick, or the
 * sale form's lari price, with no usable rate).
 */
export function refreshRate(force = false): Promise<UsdRate | null> {
  if (inFlight) return inFlight;
  const now = Date.now();
  const entry = readRateEntry();
  if (
    (entry &&
      entry.rate.date === tbilisiDay(new Date(now)) &&
      now - entry.fetchedAt < REFRESH_MS) ||
    (!force && now - lastAttemptAt < RETRY_MS)
  ) {
    return Promise.resolve(readRate());
  }
  lastAttemptAt = now;
  inFlight = fetch("/api/fx/usd", {
    cache: "no-store",
    signal:
      typeof AbortSignal.timeout === "function"
        ? AbortSignal.timeout(10_000)
        : undefined,
  })
    .then((res) => (res.ok ? res.json() : null))
    .then((body: unknown) => {
      const rate = parseUsdRate(body);
      if (!rate) {
        retryWhilePicked();
        return readRate();
      }
      rateEntry = { rate, fetchedAt: Date.now() };
      try {
        window.localStorage.setItem(
          RATE_KEY,
          JSON.stringify({ ...rate, fetchedAt: rateEntry.fetchedAt }),
        );
      } catch {
        // Kept in memory for this page view.
      }
      window.dispatchEvent(new Event(CHANGE_EVENT));
      return rate;
    })
    .catch(() => {
      // No rate: prices stay in their own currency until a retry succeeds.
      retryWhilePicked();
      return readRate();
    })
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}

// One retry while a pick waits for a rate (NBG or the network was down).
function retryWhilePicked(): void {
  if (retryTimer || !readCurrency()) return;
  retryTimer = setTimeout(() => {
    retryTimer = null;
    if (readCurrency()) void refreshRate(true);
  }, RETRY_MS);
}

/** Saves the visitor's pick (null = every price in its own currency). */
export function setDisplayCurrency(currency: CurrencyCode | null): void {
  memoryCurrency = currency;
  try {
    if (currency) window.localStorage.setItem(CURRENCY_KEY, currency);
    else window.localStorage.removeItem(CURRENCY_KEY);
    pickInMemory = false;
  } catch {
    // Kept in memory for this page view.
    pickInMemory = true;
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
  if (currency) {
    void refreshRate(!isUsableRate(readRate(), tbilisiDay(new Date())));
  }
}

export function useDisplayCurrency(): CurrencyCode | null {
  return useSyncExternalStore(subscribe, readCurrency, serverSnapshot);
}

export function useUsdRate(): UsdRate | null {
  return useSyncExternalStore(subscribe, readRate, serverSnapshot);
}

/** A sale row as useMoney().sale reads it: its price columns and, when the
 * price shows one, its discount (C10). */
export type SaleMoneyRow = SalePriceRow & {
  discount_percent?: number | null;
  discount_expires_at?: string | null;
};

/** A sale's price texts for the visitor's pick. */
export interface SaleMoney {
  /** The price the listing shows, after an active discount. */
  text: string;
  /** The price before an active discount; null without one. */
  originalText: string | null;
  /** The shown price per m²; null without an area. */
  perSqmText: string | null;
}

export interface MoneyFormat {
  /** The visitor's pick; null = every price in its own currency. */
  currency: CurrencyCode | null;
  /**
   * The converted text, or null when the price stays in its own currency.
   * `whole` drops the cents under 10 (the edges of a price bucket).
   */
  converted(
    amount: number,
    from: CurrencyCode,
    options?: { whole?: boolean },
  ): string | null;
  /** The converted text, else `native` (default formatPrice / formatSalePrice). */
  format(amount: number, from: CurrencyCode, native?: string): string;
  /**
   * A sale's price (C54), or null without one: its seller's currency until a
   * pick (the server and hydration print the same through format.ts), then
   * the other stored number; only a legacy dollar-only row under a ₾ pick is
   * converted. The discount and the per-m² figure start from the shown number.
   */
  sale(
    row: SaleMoneyRow,
    options?: { areaSqm?: number | null },
  ): SaleMoney | null;
}

/** Formats prices for the visitor's currency pick (C55). */
export function useMoney(): MoneyFormat {
  const currency = useDisplayCurrency();
  const rate = useUsdRate();
  useEffect(() => {
    if (currency) void refreshRate();
  }, [currency]);
  return useMemo(() => {
    // The day is read per call: a tab left open past midnight still retires an
    // old rate (RATE_MAX_AGE_DAYS).
    const converted = (
      amount: number,
      from: CurrencyCode,
      options?: { whole?: boolean },
    ) =>
      convertedPriceText(
        amount,
        from,
        currency,
        rate,
        tbilisiDay(new Date()),
        options?.whole,
      );
    const sale = (
      row: SaleMoneyRow,
      options?: { areaSqm?: number | null },
    ): SaleMoney | null => {
      const price = salePrice(row);
      if (!price) return null;
      const shown = salePriceShown(price, currency);
      const print = (amount: number) =>
        (shown.live ? converted(amount, shown.currency) : null) ??
        formatInCurrency(amount, shown.currency);
      const amount = applyDiscount(
        shown.amount,
        row.discount_percent,
        row.discount_expires_at,
      );
      const area = options?.areaSqm;
      return {
        text: print(amount),
        originalText: isDiscountActive(
          row.discount_percent,
          row.discount_expires_at,
        )
          ? print(shown.amount)
          : null,
        perSqmText: area && area > 0 ? print(amount / area) : null,
      };
    };
    return {
      currency,
      converted,
      format: (amount, from, native) =>
        converted(amount, from) ?? native ?? formatInCurrency(amount, from),
      sale,
    };
  }, [currency, rate]);
}
