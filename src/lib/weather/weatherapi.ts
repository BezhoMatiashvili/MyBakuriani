import type { LocalizedText, StatusIcon } from "@/lib/status-cards/types";

export type BakurianiWeather = {
  temperatureC: number;
  // Today's forecast high / low, used for the card's day/night reading.
  dayTempC: number;
  nightTempC: number;
  // Today's total snowfall in cm. Always a number — 0 when there is no snow,
  // because the card must say "0 სმ" rather than hide the row.
  snowCm: number;
  condition: LocalizedText;
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
  forecast?: {
    forecastday?: Array<{
      day?: {
        maxtemp_c?: number;
        mintemp_c?: number;
        totalsnow_cm?: number;
      };
    }>;
  };
};

// WeatherAPI condition codes are stable across its localized condition text.
// We deliberately expose only the app's existing status-card icon vocabulary.
export function weatherApiCodeToStatusIcon(
  code: number,
  isDay: number,
): StatusIcon {
  if (code === 1000) return isDay === 1 ? "sun" : "moon";
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

// Short (one-to-two word) condition wording per WeatherAPI code group. The
// provider's own `lang=` parameter has no Georgian, so the mapping lives here
// and is keyed on the numeric code, which is locale-independent. Kept
// deliberately terse: it renders on a ~140-260px landing card.
const CONDITION_CLEAR_DAY: LocalizedText = {
  ka: "მზიანი",
  en: "Sunny",
  ru: "Ясно",
};
const CONDITION_CLEAR_NIGHT: LocalizedText = {
  ka: "უღრუბლო",
  en: "Clear",
  ru: "Ясно",
};
const CONDITION_PARTLY_CLOUDY: LocalizedText = {
  ka: "ნაწილობრივ ღრუბლიანი",
  en: "Partly cloudy",
  ru: "Переменная облачность",
};
const CONDITION_CLOUDY: LocalizedText = {
  ka: "ღრუბლიანი",
  en: "Cloudy",
  ru: "Облачно",
};
const CONDITION_FOG: LocalizedText = {
  ka: "ნისლიანი",
  en: "Foggy",
  ru: "Туман",
};
const CONDITION_THUNDER: LocalizedText = {
  ka: "ჭექა-ქუხილი",
  en: "Thunderstorm",
  ru: "Гроза",
};
const CONDITION_SNOW: LocalizedText = {
  ka: "თოვლიანი",
  en: "Snowy",
  ru: "Снег",
};
const CONDITION_SLEET: LocalizedText = {
  ka: "თოვლჭყაპი",
  en: "Sleet",
  ru: "Мокрый снег",
};
const CONDITION_RAIN: LocalizedText = {
  ka: "წვიმიანი",
  en: "Rainy",
  ru: "Дождь",
};
const CONDITION_DRIZZLE: LocalizedText = {
  ka: "სუსტი წვიმა",
  en: "Light rain",
  ru: "Небольшой дождь",
};

export function weatherApiCodeToCondition(
  code: number,
  isDay: number,
): LocalizedText {
  if (code === 1000) {
    return isDay === 1 ? CONDITION_CLEAR_DAY : CONDITION_CLEAR_NIGHT;
  }
  if (code === 1003) return CONDITION_PARTLY_CLOUDY;
  if (code === 1006 || code === 1009) return CONDITION_CLOUDY;
  if (code === 1030 || code === 1135 || code === 1147) return CONDITION_FOG;
  if (code === 1087 || (code >= 1273 && code <= 1282)) return CONDITION_THUNDER;
  if (
    code === 1069 ||
    code === 1204 ||
    code === 1207 ||
    code === 1249 ||
    code === 1252
  ) {
    return CONDITION_SLEET;
  }
  if (
    code === 1066 ||
    code === 1114 ||
    code === 1117 ||
    (code >= 1210 && code <= 1237) ||
    (code >= 1255 && code <= 1264)
  ) {
    return CONDITION_SNOW;
  }
  if (code === 1063 || code === 1072 || (code >= 1150 && code <= 1171)) {
    return CONDITION_DRIZZLE;
  }
  if ((code >= 1180 && code <= 1201) || (code >= 1240 && code <= 1246)) {
    return CONDITION_RAIN;
  }
  return CONDITION_CLOUDY;
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

  // Forecast block is optional: a `current.json` style payload (or a provider
  // plan without forecast) still yields a usable card, it just falls back to
  // the current reading for both day and night.
  const today = payload.forecast?.forecastday?.[0]?.day;
  const maxTempC = today?.maxtemp_c;
  const minTempC = today?.mintemp_c;
  const totalSnowCm = today?.totalsnow_cm;

  return {
    temperatureC,
    dayTempC:
      typeof maxTempC === "number" && Number.isFinite(maxTempC)
        ? maxTempC
        : temperatureC,
    nightTempC:
      typeof minTempC === "number" && Number.isFinite(minTempC)
        ? minTempC
        : temperatureC,
    snowCm:
      typeof totalSnowCm === "number" && Number.isFinite(totalSnowCm)
        ? Math.max(0, totalSnowCm)
        : 0,
    condition: weatherApiCodeToCondition(conditionCode, isDay),
    icon: weatherApiCodeToStatusIcon(conditionCode, isDay),
    observedAt: observedAt.toISOString(),
  };
}

export function formatWeatherTemperature(temperatureC: number): string {
  const rounded = Math.round(temperatureC);
  return `${Object.is(rounded, -0) ? 0 : rounded}°C`;
}

// Snow depth rendered with at most one decimal, so a 0.5cm dusting is not
// rounded away to the same "0 სმ" that means "no snow at all".
export function formatSnowCm(snowCm: number): string {
  const rounded = Math.round(snowCm * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}
