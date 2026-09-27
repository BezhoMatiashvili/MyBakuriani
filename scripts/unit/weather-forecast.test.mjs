import { test } from "node:test";
import assert from "node:assert/strict";
import {
  formatForecastDayLabel,
  isForecastDate,
  parseWeatherApiWeather,
} from "../../src/lib/weather/weatherapi.ts";

// Shape of a WeatherAPI forecast.json body (free plan: 3 forecast days).
const current = {
  temp_c: 15,
  is_day: 1,
  last_updated_epoch: 1790500000,
  condition: { code: 1009 },
};
const forecastDay = (date, maxtemp_c, mintemp_c, code) => ({
  date,
  day: { maxtemp_c, mintemp_c, totalsnow_cm: 0, condition: { code } },
});

test("parseWeatherApiWeather reads every forecast day, today first", () => {
  const weather = parseWeatherApiWeather({
    current,
    forecast: {
      forecastday: [
        forecastDay("2026-09-27", 20.8, 8.1, 1009),
        forecastDay("2026-09-28", 22.7, 6.4, 1063),
        forecastDay("2026-09-29", 14, 6.2, 1240),
      ],
    },
  });
  assert.deepEqual(
    weather.forecast.map((day) => [day.date, day.maxTempC, day.minTempC]),
    [
      ["2026-09-27", 20.8, 8.1],
      ["2026-09-28", 22.7, 6.4],
      ["2026-09-29", 14, 6.2],
    ],
  );
  assert.deepEqual(
    weather.forecast.map((day) => day.icon),
    ["cloud", "cloudRain", "cloudRain"],
  );
  assert.equal(weather.forecast[0].condition.ka, "ღრუბლიანი");
  assert.equal(weather.forecast[2].condition.ka, "წვიმიანი");
  // Today's high/low still drive the card face.
  assert.equal(weather.dayTempC, 20.8);
  assert.equal(weather.nightTempC, 8.1);
});

test("a clear forecast day is described as daytime", () => {
  const weather = parseWeatherApiWeather({
    current: { ...current, is_day: 0 },
    forecast: { forecastday: [forecastDay("2026-09-27", 10, 1, 1000)] },
  });
  assert.equal(weather.forecast[0].icon, "sun");
  assert.equal(weather.forecast[0].condition.en, "Sunny");
});

test("malformed forecast days are dropped, not shown half-empty", () => {
  const weather = parseWeatherApiWeather({
    current,
    forecast: {
      forecastday: [
        forecastDay("2026-09-27", 20, 8, 1009),
        { date: "2026-09-28", day: { maxtemp_c: 20, mintemp_c: 8 } },
        forecastDay("28/09/2026", 20, 8, 1009),
        forecastDay("2026-09-30", Number.NaN, 8, 1009),
        { day: { maxtemp_c: 20, mintemp_c: 8, condition: { code: 1009 } } },
      ],
    },
  });
  assert.deepEqual(
    weather.forecast.map((day) => day.date),
    ["2026-09-27"],
  );
});

test("a payload without a forecast block yields an empty forecast", () => {
  const weather = parseWeatherApiWeather({ current });
  assert.deepEqual(weather.forecast, []);
});

test("formatForecastDayLabel names the weekday and day of month", () => {
  assert.deepEqual(formatForecastDayLabel("2026-09-27"), {
    ka: "კვი 27",
    en: "Sun 27",
    ru: "Вс 27",
  });
  assert.deepEqual(formatForecastDayLabel("2026-09-28"), {
    ka: "ორშ 28",
    en: "Mon 28",
    ru: "Пн 28",
  });
  assert.equal(formatForecastDayLabel("2026-10-03").ka, "შაბ 3");
});

test("isForecastDate accepts only YYYY-MM-DD strings", () => {
  assert.equal(isForecastDate("2026-09-28"), true);
  assert.equal(isForecastDate("2026-9-28"), false);
  assert.equal(isForecastDate("2026-09-28T00:00:00Z"), false);
  assert.equal(isForecastDate(20260928), false);
  assert.equal(isForecastDate(undefined), false);
});
