import "server-only";
import { cache } from "react";
import type { StatusCard } from "@/lib/status-cards/types";
import { withWeatherCard } from "./card";
import {
  formatSnowCm,
  formatWeatherTemperature,
  parseWeatherApiWeather,
  type BakurianiWeather,
  type WeatherApiResponse,
} from "./weatherapi";

export {
  formatSnowCm,
  formatWeatherTemperature,
  parseWeatherApiWeather,
  weatherApiCodeToStatusIcon,
  type BakurianiWeather,
  type WeatherApiResponse,
} from "./weatherapi";

// Bakuriani ski resort town centre.
const BAKURIANI_LAT = 41.75;
const BAKURIANI_LNG = 43.53;
// forecast.json (not current.json): the landing card needs today's high/low
// and snowfall alongside the live reading, and the forecast payload is a
// superset of the current one.
const WEATHERAPI_URL = "https://api.weatherapi.com/v1/forecast.json";

export const WEATHER_REVALIDATE_SECONDS = 10 * 60;

// Fetches the live Bakuriani weather from WeatherAPI. It is intentionally
// server-only: the API key is used only in this outbound request. Returns null
// on a missing key, network failure, or malformed provider response so callers
// keep the admin/default card value instead of rendering a blank card.
export const getBakurianiWeather = cache(
  async (): Promise<BakurianiWeather | null> => {
    try {
      const apiKey = process.env.WEATHERAPI_API_KEY?.trim();
      if (!apiKey) return null;

      const url = new URL(WEATHERAPI_URL);
      url.searchParams.set("key", apiKey);
      url.searchParams.set("q", `${BAKURIANI_LAT},${BAKURIANI_LNG}`);
      url.searchParams.set("days", "1");
      url.searchParams.set("aqi", "no");
      url.searchParams.set("alerts", "no");

      const res = await fetch(url, {
        next: { revalidate: WEATHER_REVALIDATE_SECONDS },
      });
      if (!res.ok) return null;

      return parseWeatherApiWeather((await res.json()) as WeatherApiResponse);
    } catch {
      return null;
    }
  },
);

// Overrides the live weather card's value, caption and icon with the latest
// reading. Live always wins (per product decision) while the label / card
// presence stay admin-editable. No-op when weather is unavailable or the card
// was removed. The card face itself is built in ./card.ts, which the client
// refresh poll shares.
export function withLiveWeather(
  cards: StatusCard[],
  weather: BakurianiWeather | null,
): StatusCard[] {
  if (!weather) return cards;
  return withWeatherCard(cards, weather);
}
