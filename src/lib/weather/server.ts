import "server-only";
import { cache } from "react";
import type { StatusCard, StatusIcon } from "@/lib/status-cards/types";

// Bakuriani ski resort town centre. Open-Meteo snaps to its grid (elevation
// resolves to ~1669m, confirming the location) — no API key, no rate limit.
const BAKURIANI_LAT = 41.75;
const BAKURIANI_LNG = 43.53;
const OPEN_METEO_URL =
  `https://api.open-meteo.com/v1/forecast?latitude=${BAKURIANI_LAT}` +
  `&longitude=${BAKURIANI_LNG}&current=temperature_2m,weather_code`;

// Refresh cadence for the Next data cache. Weather changes slowly and this keeps
// the landing page ISR-friendly (a handful of upstream requests per hour).
const WEATHER_REVALIDATE_SECONDS = 900;

export type BakurianiWeather = {
  temperatureC: number;
  weatherCode: number;
};

type OpenMeteoResponse = {
  current?: {
    temperature_2m?: number;
    weather_code?: number;
  };
};

// Fetches the live Bakuriani weather from Open-Meteo. Returns null on any error
// (network, non-ok, bad shape) so callers fall back to the existing card value
// instead of rendering blank. cache() dedupes within a single render.
export const getBakurianiWeather = cache(
  async (): Promise<BakurianiWeather | null> => {
    try {
      const res = await fetch(OPEN_METEO_URL, {
        next: { revalidate: WEATHER_REVALIDATE_SECONDS },
      });
      if (!res.ok) return null;

      const json = (await res.json()) as OpenMeteoResponse;
      const temperatureC = json.current?.temperature_2m;
      const weatherCode = json.current?.weather_code;
      if (typeof temperatureC !== "number" || !Number.isFinite(temperatureC)) {
        return null;
      }

      return {
        temperatureC,
        weatherCode: typeof weatherCode === "number" ? weatherCode : -1,
      };
    } catch {
      return null;
    }
  },
);

// Mirrors the existing "-4°C" format (no space, °C). Math.round avoids a "-0°C"
// glitch for tiny negative readings.
function formatTemperature(c: number): string {
  return `${Math.round(c)}°C`;
}

// Maps a WMO weather interpretation code to one of the whitelisted condition
// icons. See https://open-meteo.com/en/docs (WMO Weather interpretation codes).
function weatherCodeToIcon(code: number): StatusIcon {
  if (code === 0) return "sun"; // clear sky
  if (code === 1 || code === 2) return "cloudSun"; // mainly clear / partly cloudy
  if (code === 3) return "cloud"; // overcast
  if (code === 45 || code === 48) return "cloudFog"; // fog
  if (code >= 95) return "cloudLightning"; // thunderstorm (95, 96, 99)
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) {
    return "cloudSnow"; // snow
  }
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) {
    return "cloudRain"; // drizzle / rain / rain showers
  }
  return "cloud";
}

// Overrides the live weather card's value and icon with the latest reading.
// Live always wins (per product decision) while the label / card presence stay
// admin-editable. No-op when weather is unavailable or the card was removed.
export function withLiveWeather(
  cards: StatusCard[],
  weather: BakurianiWeather | null,
): StatusCard[] {
  if (!weather) return cards;
  const value = formatTemperature(weather.temperatureC);
  return cards.map((card) =>
    card.id === "weather"
      ? {
          ...card,
          value: { ka: value, en: value, ru: value },
          icon: weatherCodeToIcon(weather.weatherCode),
        }
      : card,
  );
}
