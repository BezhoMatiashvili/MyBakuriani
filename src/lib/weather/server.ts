import "server-only";
import { cache } from "react";
import type { StatusCard } from "@/lib/status-cards/types";
import {
  formatWeatherTemperature,
  parseWeatherApiWeather,
  type BakurianiWeather,
  type WeatherApiResponse,
} from "./weatherapi";

export {
  formatWeatherTemperature,
  parseWeatherApiWeather,
  weatherApiCodeToStatusIcon,
  type BakurianiWeather,
  type WeatherApiResponse,
} from "./weatherapi";

// Bakuriani ski resort town centre.
const BAKURIANI_LAT = 41.75;
const BAKURIANI_LNG = 43.53;
const WEATHERAPI_URL = "https://api.weatherapi.com/v1/current.json";

export const WEATHER_REVALIDATE_SECONDS = 30 * 60;

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

      const res = await fetch(url, {
        next: { revalidate: WEATHER_REVALIDATE_SECONDS },
      });
      if (!res.ok) return null;

      return parseWeatherApiWeather(
        (await res.json()) as WeatherApiResponse,
      );
    } catch {
      return null;
    }
  },
);

// Overrides the live weather card's value and icon with the latest reading.
// Live always wins (per product decision) while the label / card presence stay
// admin-editable. No-op when weather is unavailable or the card was removed.
export function withLiveWeather(
  cards: StatusCard[],
  weather: BakurianiWeather | null,
): StatusCard[] {
  if (!weather) return cards;
  const value = formatWeatherTemperature(weather.temperatureC);
  return cards.map((card) =>
    card.id === "weather"
      ? {
          ...card,
          value: { ka: value, en: value, ru: value },
          icon: weather.icon,
        }
      : card,
  );
}
