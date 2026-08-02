"use client";

import { useCallback, useEffect, useState } from "react";
import StatusCards from "@/components/landing/StatusCards";
import {
  isStatusIcon,
  type StatusCard,
  type StatusIcon,
} from "@/lib/status-cards/types";

const WEATHER_REFRESH_MS = 30 * 60 * 1000;

type PublicWeatherPayload = {
  temperatureC: number;
  icon: StatusIcon;
  observedAt: string;
};

function isPublicWeatherPayload(value: unknown): value is PublicWeatherPayload {
  if (!value || typeof value !== "object") return false;
  const weather = value as Record<string, unknown>;
  return (
    typeof weather.temperatureC === "number" &&
    Number.isFinite(weather.temperatureC) &&
    typeof weather.observedAt === "string" &&
    Number.isFinite(new Date(weather.observedAt).getTime()) &&
    isStatusIcon(weather.icon)
  );
}

function formatTemperature(temperatureC: number) {
  const rounded = Math.round(temperatureC);
  return `${Object.is(rounded, -0) ? 0 : rounded}°C`;
}

function withRefreshedWeather(
  cards: StatusCard[],
  weather: PublicWeatherPayload,
): StatusCard[] {
  const value = formatTemperature(weather.temperatureC);
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

// Deliberately used only by the landing page. Apartment and hotel pages retain
// their static status-card rendering and never start a weather polling loop.
export default function HomeStatusCards({ cards }: { cards: StatusCard[] }) {
  const [displayedCards, setDisplayedCards] = useState(cards);

  const refreshWeather = useCallback(async () => {
    try {
      const response = await fetch("/api/weather", { cache: "no-store" });
      if (!response.ok) return;
      const payload: unknown = await response.json();
      if (!isPublicWeatherPayload(payload)) return;
      setDisplayedCards((current) => withRefreshedWeather(current, payload));
    } catch {
      // Keep the server-rendered or previously refreshed weather on failures.
    }
  }, []);

  useEffect(() => {
    let hiddenAt: number | null = null;
    void refreshWeather();

    const interval = window.setInterval(refreshWeather, WEATHER_REFRESH_MS);
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        hiddenAt = Date.now();
      } else if (
        hiddenAt !== null &&
        Date.now() - hiddenAt >= WEATHER_REFRESH_MS
      ) {
        hiddenAt = null;
        void refreshWeather();
      }
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [refreshWeather]);

  return (
    <div data-testid="homepage-status-cards">
      <StatusCards
        cards={displayedCards}
        className="mt-8 -mb-[42px]"
        mobileLayout="single-page"
      />
    </div>
  );
}
