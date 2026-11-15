// What the live pages (/live-cameras, /weather-and-lifts, /road-status, C40)
// may print from the status cards. Pure (type imports only) so
// scripts/unit/status-card-live-page.test.mjs can import it.
//
// getLiveStatusCards falls back to the admin cards and, without a DB row, to
// DEFAULT_STATUS_CARDS ("-4°C", "3/5 ღია"): text that is not a reading. A card
// is printed only when it carries one; otherwise the page says "unavailable".

import type { StatusCard } from "./types";

/** Same bound as the home page's getLiveStatusCards call. */
export const LIVE_PAGE_TIMEOUT_MS = 7_000;

export const LIVE_PAGE_PATHS = {
  cameras: "/live-cameras",
  weather: "/weather-and-lifts",
  road: "/road-status",
} as const;

export type LivePageKey = keyof typeof LIVE_PAGE_PATHS;

/**
 * The only host a camera may be framed from: it must be in the middleware's
 * CSP frame-src (check-contracts C40). Any other stream is linked out.
 */
export const EMBED_HOST = "rtsp.me";

export function isEmbeddableCamera(href: string): boolean {
  try {
    const url = new URL(href);
    return url.protocol === "https:" && url.hostname === EMBED_HOST;
  } catch {
    return false;
  }
}

// Weather and road: rows exist only once the provider answered (withLiveRoad
// always adds them; withWeatherCard adds the forecast days when it gets any, so
// a reading without a forecast reads as unavailable, never as a made-up one).
// Lifts are kept by hand: they print only with the date of the admin's change.
export function readingCard(
  cards: readonly StatusCard[],
  id: "weather" | "lifts" | "road",
): StatusCard | null {
  const card = cards.find((c) => c.id === id);
  if (!card || card.items.length === 0) return null;
  if (id === "lifts" && !Number.isFinite(Date.parse(card.updatedAt ?? ""))) {
    return null;
  }
  return card;
}
