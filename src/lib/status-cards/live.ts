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
export async function getLiveStatusCards(
  timeoutMs: number,
): Promise<StatusCard[]> {
  const [cards, weather, road, lifts] = await Promise.all([
    withTimeout(getStatusCards(), timeoutMs, DEFAULT_STATUS_CARDS),
    withTimeout(getBakurianiWeather(), timeoutMs, null),
    withTimeout(getRoadCondition(), timeoutMs, null),
    // Live ski-lift status is gated OFF until it can be verified against the
    // live status.mta.ski site (currently 500; backend deployment deleted, not
    // merely off-season) — see src/lib/ski-lifts/server.ts. When disabled it
    // resolves null and the admin-editable lifts card shows through unchanged.
    process.env.SKI_LIFTS_ENABLED === "true"
      ? withTimeout(getSkiLifts(), timeoutMs, null)
      : Promise.resolve(null),
  ]);

  return withLiveLifts(
    withLiveRoad(withLiveWeather(cards, weather), road),
    lifts,
  );
}
