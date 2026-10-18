import "server-only";
import { withTimeout } from "@/lib/with-timeout";
import { getRoadCondition, withLiveRoad } from "@/lib/road-condition/server";
import { getBakurianiWeather, withLiveWeather } from "@/lib/weather/server";
import { getStatusCards } from "./server";
import { DEFAULT_STATUS_CARDS, type StatusCard } from "./types";

// THE one place that turns the admin-managed status cards into what visitors
// see: the cards with live weather and road status laid over them. Every
// page that renders the cards goes through here. A page that read
// getStatusCards() alone showed the admin default ("-4°C", no caption) where
// the home page showed the live reading, so pressing Search swapped the
// weather card.
//
// Each live source falls back to the admin card when its read failed, timed
// out, or is still unknown (null). `timeoutMs` bounds every read so a stalled
// provider yields the admin card instead of holding the page.
//
// The lifts card is maintained by hand in the admin panel (2026-10-05) and
// shows the date of the admin's last change. The status.mta.ski overlay
// (src/lib/ski-lifts/server.ts: getSkiLifts + withLiveLifts) is deliberately
// not wired here, so SKI_LIFTS_ENABLED no longer does anything: re-adding it
// would replace the admin's lifts while the card still showed the admin's date.
export async function getLiveStatusCards(
  timeoutMs: number,
): Promise<StatusCard[]> {
  const [cards, weather, road] = await Promise.all([
    withTimeout(getStatusCards(), timeoutMs, DEFAULT_STATUS_CARDS),
    withTimeout(getBakurianiWeather(), timeoutMs, null),
    withTimeout(getRoadCondition(), timeoutMs, null),
  ]);

  return withLiveRoad(withLiveWeather(cards, weather), road);
}
