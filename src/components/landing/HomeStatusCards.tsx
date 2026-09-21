"use client";

import { useCallback, useEffect, useState } from "react";
import StatusCards from "@/components/landing/StatusCards";
import { isStatusIcon, type StatusCard } from "@/lib/status-cards/types";
import { withWeatherCard } from "@/lib/weather/card";
import type { BakurianiWeather } from "@/lib/weather/weatherapi";

const WEATHER_REFRESH_MS = 10 * 60 * 1000;

// Mirrors the /api/weather body, which is the server's normalized
// BakurianiWeather. Validated field-by-field because it crosses the network.
type PublicWeatherPayload = BakurianiWeather;

function isLocalizedText(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const text = value as Record<string, unknown>;
  return typeof text.ka === "string";
}

function isFiniteNumber(value: unknown): boolean {
  return typeof value === "number" && Number.isFinite(value);
}

function isPublicWeatherPayload(value: unknown): value is PublicWeatherPayload {
  if (!value || typeof value !== "object") return false;
  const weather = value as Record<string, unknown>;
  return (
    isFiniteNumber(weather.temperatureC) &&
    isFiniteNumber(weather.dayTempC) &&
    isFiniteNumber(weather.nightTempC) &&
    isFiniteNumber(weather.snowCm) &&
    isLocalizedText(weather.condition) &&
    typeof weather.observedAt === "string" &&
    Number.isFinite(new Date(weather.observedAt).getTime()) &&
    isStatusIcon(weather.icon)
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
      setDisplayedCards((current) => withWeatherCard(current, payload));
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
        className="mt-5 -mb-[72px] sm:mt-8 sm:-mb-[42px]"
        mobileLayout="home-compact"
      />
    </div>
  );
}
