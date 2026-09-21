import {
  pickLocalized,
  type LocalizedText,
  type StatusCard,
} from "@/lib/status-cards/types";
import {
  formatSnowCm,
  formatWeatherTemperature,
  type BakurianiWeather,
} from "./weatherapi";

// Wording for the day/night split and the snow caption. Built here rather than
// in the message catalogs because status-card text is LocalizedText resolved at
// render time, never a next-intl namespace (so C1 does not apply).
const NIGHT_SUFFIX: LocalizedText = { ka: "ღამე", en: "night", ru: "ночь" };
const SNOW_LABEL: LocalizedText = { ka: "თოვლი", en: "snow", ru: "снег" };
const SNOW_UNIT: LocalizedText = { ka: "სმ", en: "cm", ru: "см" };

const WEATHER_LOCALES = ["ka", "en", "ru"] as const;

// "11°C / 3°C ღამე" — the live reading, then tonight's low.
export function buildWeatherValue(weather: BakurianiWeather): LocalizedText {
  const now = formatWeatherTemperature(weather.temperatureC);
  const night = formatWeatherTemperature(weather.nightTempC);
  const value: LocalizedText = { ka: "" };
  for (const locale of WEATHER_LOCALES) {
    value[locale] = `${now} / ${night} ${pickLocalized(NIGHT_SUFFIX, locale)}`;
  }
  return value;
}

// "ნაწილობრივ ღრუბლიანი · თოვლი 0 სმ" — the short condition plus snowfall.
// Snow is always shown, including as 0, so "no snow" reads as a real reading
// rather than a missing row.
export function buildWeatherSubValue(
  weather: BakurianiWeather,
): LocalizedText {
  const snow = formatSnowCm(weather.snowCm);
  const subValue: LocalizedText = { ka: "" };
  for (const locale of WEATHER_LOCALES) {
    const condition = pickLocalized(weather.condition, locale);
    const label = pickLocalized(SNOW_LABEL, locale);
    const unit = pickLocalized(SNOW_UNIT, locale);
    subValue[locale] = `${condition} · ${label} ${snow} ${unit}`;
  }
  return subValue;
}

// THE single definition of what the weather card face says. Both the server
// render (withLiveWeather) and the client's 10-minute refresh poll go through
// this, so a refresh can never silently drop back to a bare temperature.
//
// Note this takes `subValue` on the weather card under LIVE ownership, where
// previously only `value`/`icon` were live and `subValue` was admin-editable.
// That is deliberate: the caption now carries real readings (condition +
// snowfall), so it must not be overridable by stale hand-typed text. Unlike
// withItemNameSubtitles, there is intentionally no `|| card.subValue` guard —
// such a guard would let an admin silently blank the forecast. The weather
// card's label and its presence/ordering remain admin-editable as before.
export function withWeatherCard(
  cards: StatusCard[],
  weather: BakurianiWeather,
): StatusCard[] {
  const value = buildWeatherValue(weather);
  const subValue = buildWeatherSubValue(weather);
  return cards.map((card) =>
    card.id === "weather" ? { ...card, value, subValue, icon: weather.icon } : card,
  );
}
