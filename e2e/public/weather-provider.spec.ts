import { expect, test } from "@playwright/test";
import {
  formatWeatherTemperature,
  parseWeatherApiWeather,
  weatherApiCodeToStatusIcon,
} from "../../src/lib/weather/weatherapi";

test.describe("WeatherAPI weather normalization", () => {
  test("parses only the public current-weather fields", () => {
    expect(
      parseWeatherApiWeather({
        current: {
          temp_c: -4.6,
          is_day: 0,
          last_updated_epoch: 1_721_815_200,
          condition: { code: 1213 },
        },
      }),
    ).toEqual({
      temperatureC: -4.6,
      icon: "cloudSnow",
      observedAt: "2024-07-24T10:00:00.000Z",
    });
    expect(parseWeatherApiWeather({ current: { temp_c: 2 } })).toBe(null);
  });

  test("maps representative provider codes and rounds display temperatures", () => {
    expect(weatherApiCodeToStatusIcon(1000, 1)).toBe("sun");
    expect(weatherApiCodeToStatusIcon(1003, 0)).toBe("cloudSun");
    expect(weatherApiCodeToStatusIcon(1183, 1)).toBe("cloudRain");
    expect(weatherApiCodeToStatusIcon(1276, 1)).toBe("cloudLightning");
    expect(weatherApiCodeToStatusIcon(9999, 1)).toBe("cloud");
    expect(formatWeatherTemperature(2.6)).toBe("3°C");
    expect(formatWeatherTemperature(-0.2)).toBe("0°C");
  });
});
