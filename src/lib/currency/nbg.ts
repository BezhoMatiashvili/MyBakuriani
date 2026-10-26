import "server-only";
import {
  isUsableRate,
  parseNbgUsdRate,
  tbilisiDay,
  type UsdRate,
} from "./money";

// The National Bank of Georgia's official rates (C55). `date` asks for the
// rate in force on that Tbilisi day: from about 17:00 NBG already publishes
// tomorrow's fix, and an undated request would answer with it.
const NBG_RATES_URL =
  "https://nbg.gov.ge/gw/api/ct/monetarypolicy/currencies/en/json/";
const REFRESH_MS = 60 * 60 * 1000;
const FAILURE_BACKOFF_MS = 5 * 60 * 1000;
const TIMEOUT_MS = 5000;

// Kept in this server's memory (the route is force-dynamic, so Next's fetch
// cache is not used): NBG is asked at most once an hour per server (every 5
// minutes while it fails), and a short NBG outage keeps serving the last real
// rate (up to RATE_MAX_AGE_DAYS).
let lastGood: { rate: UsdRate; fetchedAt: number } | null = null;
let lastFailureAt = 0;
let inFlight: { day: string; promise: Promise<UsdRate | null> } | null = null;

async function fetchNbgUsdRate(day: string): Promise<UsdRate | null> {
  try {
    const url = new URL(NBG_RATES_URL);
    url.searchParams.set("currencies", "USD");
    url.searchParams.set("date", day);
    const res = await fetch(url, {
      cache: "no-store",
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return null;
    // A bot-challenge HTML page throws here and counts as no answer.
    return parseNbgUsdRate(await res.json(), day);
  } catch {
    return null;
  }
}

/** Today's official USD rate, or null when NBG has given none recently. */
export async function getNbgUsdRate(now = new Date()): Promise<UsdRate | null> {
  const day = tbilisiDay(now);
  if (
    lastGood &&
    lastGood.rate.date === day &&
    now.getTime() - lastGood.fetchedAt < REFRESH_MS
  ) {
    return lastGood.rate;
  }
  if (
    inFlight?.day !== day &&
    now.getTime() - lastFailureAt < FAILURE_BACKOFF_MS
  ) {
    return lastGood && isUsableRate(lastGood.rate, day) ? lastGood.rate : null;
  }
  if (inFlight?.day !== day) {
    const promise = fetchNbgUsdRate(day).finally(() => {
      if (inFlight?.promise === promise) inFlight = null;
    });
    inFlight = { day, promise };
  }
  const fresh = await inFlight.promise;
  if (fresh) {
    lastGood = { rate: fresh, fetchedAt: now.getTime() };
    return fresh;
  }
  lastFailureAt = now.getTime();
  return lastGood && isUsableRate(lastGood.rate, day) ? lastGood.rate : null;
}
