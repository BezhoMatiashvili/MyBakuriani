"use client";

import { useEffect, useMemo, useSyncExternalStore } from "react";
import { formatPrice, formatSalePrice } from "@/lib/utils/format";
import {
  convertedPriceText,
  isCurrencyCode,
  isUsableRate,
  parseUsdRate,
  tbilisiDay,
  type CurrencyCode,
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
let inFlight = false;
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
 * Fetches today's NBG rate unless this browser already holds a fresh one.
 * `force` skips the wait after a failed attempt (a pick with no usable rate).
 */
export function refreshRate(force = false): void {
  const now = Date.now();
  const entry = readRateEntry();
  if (
    inFlight ||
    (entry &&
      entry.rate.date === tbilisiDay(new Date(now)) &&
      now - entry.fetchedAt < REFRESH_MS) ||
    (!force && now - lastAttemptAt < RETRY_MS)
  ) {
    return;
  }
  lastAttemptAt = now;
  inFlight = true;
  fetch("/api/fx/usd", {
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
        return;
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
    })
    .catch(() => {
      // No rate: prices stay in their own currency until a retry succeeds.
      retryWhilePicked();
    })
    .finally(() => {
      inFlight = false;
    });
}

// One retry while a pick waits for a rate (NBG or the network was down).
function retryWhilePicked(): void {
  if (retryTimer || !readCurrency()) return;
  retryTimer = setTimeout(() => {
    retryTimer = null;
    if (readCurrency()) refreshRate(true);
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
    refreshRate(!isUsableRate(readRate(), tbilisiDay(new Date())));
  }
}

export function useDisplayCurrency(): CurrencyCode | null {
  return useSyncExternalStore(subscribe, readCurrency, serverSnapshot);
}

export function useUsdRate(): UsdRate | null {
  return useSyncExternalStore(subscribe, readRate, serverSnapshot);
}

function nativePrice(amount: number, from: CurrencyCode): string {
  return from === "USD" ? formatSalePrice(amount) : formatPrice(amount);
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
}

/** Formats prices for the visitor's currency pick (C55). */
export function useMoney(): MoneyFormat {
  const currency = useDisplayCurrency();
  const rate = useUsdRate();
  useEffect(() => {
    if (currency) refreshRate();
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
    return {
      currency,
      converted,
      format: (amount, from, native) =>
        converted(amount, from) ?? native ?? nativePrice(amount, from),
    };
  }, [currency, rate]);
}
