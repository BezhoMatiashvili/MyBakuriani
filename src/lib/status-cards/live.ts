import "server-only";
import { withTimeout } from "@/lib/with-timeout";
import { getRoadCondition, withLiveRoad } from "@/lib/road-condition/server";
import { getSkiLifts, withLiveLifts } from "@/lib/ski-lifts/server";
import { getBakurianiWeather, withLiveWeather } from "@/lib/weather/server";
import { getStatusCards } from "./server";
import { DEFAULT_STATUS_CARDS, type StatusCard } from "./types";

// THE one place that turns the admin-managed status cards into what visitors
// see: the cards with live weather, road and lift status laid over them. Every
// page that renders the cards goes through here. A page that read
// getStatusCards() alone showed the admin default ("-4°C", no caption) where
// the home page showed the live reading, so pressing Search swapped the
// weather card.
//
// Each live source falls back to the admin card when its read failed, timed
// out, or is still unknown (null). `timeoutMs` bounds every read so a stalled
// provider yields the admin card instead of holding the page.
//
// The lifts come from MTA's feed (src/lib/ski-lifts, since 2026-11-14), with
// the date MTA last verified a lift. The lifts the admin keeps by hand (and
// the admin's date) show only while that feed is down, stale or unreadable.
export async function getLiveStatusCards(
  timeoutMs: number,
): Promise<StatusCard[]> {
  const [cards, weather, road, lifts] = await Promise.all([
    withTimeout(getStatusCards(), timeoutMs, DEFAULT_STATUS_CARDS),
    withTimeout(getBakurianiWeather(), timeoutMs, null),
    withTimeout(getRoadCondition(), timeoutMs, null),
    withTimeout(getSkiLifts(), timeoutMs, null),
  ]);

  return withLiveLifts(
    withLiveRoad(withLiveWeather(cards, weather), road),
    lifts,
  );
}
