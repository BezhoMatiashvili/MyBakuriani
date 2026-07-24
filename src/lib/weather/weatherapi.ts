import type { StatusIcon } from "@/lib/status-cards/types";

export type BakurianiWeather = {
  temperatureC: number;
  icon: StatusIcon;
  observedAt: string;
};

export type WeatherApiResponse = {
  current?: {
    temp_c?: number;
    is_day?: number;
    last_updated_epoch?: number;
    condition?: { code?: number };
  };
};

// WeatherAPI condition codes are stable across its localized condition text.
// We deliberately expose only the app's existing status-card icon vocabulary.
export function weatherApiCodeToStatusIcon(
  code: number,
  isDay: number,
): StatusIcon {
  if (code === 1000) return isDay === 1 ? "sun" : "cloud";
  if (code === 1003) return "cloudSun";
  if (code === 1006 || code === 1009) return "cloud";
  if (code === 1030 || code === 1135 || code === 1147) return "cloudFog";
  if (code === 1087 || (code >= 1273 && code <= 1282)) {
    return "cloudLightning";
  }
  if (
    code === 1066 ||
    code === 1069 ||
    code === 1114 ||
    code === 1117 ||
    (code >= 1204 && code <= 1237) ||
    (code >= 1249 && code <= 1264)
  ) {
    return "cloudSnow";
  }
  if (
    code === 1063 ||
    code === 1072 ||
    (code >= 1150 && code <= 1201) ||
    (code >= 1240 && code <= 1246)
  ) {
    return "cloudRain";
  }
  return "cloud";
}

export function parseWeatherApiWeather(
  payload: WeatherApiResponse,
): BakurianiWeather | null {
  const current = payload.current;
  const temperatureC = current?.temp_c;
  const conditionCode = current?.condition?.code;
  const isDay = current?.is_day;
  const lastUpdatedEpoch = current?.last_updated_epoch;
  if (
    typeof temperatureC !== "number" ||
    !Number.isFinite(temperatureC) ||
    typeof conditionCode !== "number" ||
    !Number.isFinite(conditionCode) ||
    (isDay !== 0 && isDay !== 1) ||
    typeof lastUpdatedEpoch !== "number" ||
    !Number.isFinite(lastUpdatedEpoch)
  ) {
    return null;
  }

  const observedAt = new Date(lastUpdatedEpoch * 1000);
  if (Number.isNaN(observedAt.getTime())) return null;

  return {
    temperatureC,
    icon: weatherApiCodeToStatusIcon(conditionCode, isDay),
    observedAt: observedAt.toISOString(),
  };
}

export function formatWeatherTemperature(temperatureC: number): string {
  const rounded = Math.round(temperatureC);
  return `${Object.is(rounded, -0) ? 0 : rounded}°C`;
}
