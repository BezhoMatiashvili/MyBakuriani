import {
  getBakurianiWeather,
  WEATHER_REVALIDATE_SECONDS,
} from "@/lib/weather/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// This endpoint deliberately returns the already-normalized public reading;
// WeatherAPI's response and API key never leave the server. Vercel's CDN
// shares one refresh for visitors for the full product-selected cadence.
export async function GET() {
  const weather = await getBakurianiWeather();
  if (!weather) {
    return Response.json(
      { error: "weather unavailable" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  return Response.json(weather, {
    headers: {
      "Cache-Control": `public, s-maxage=${WEATHER_REVALIDATE_SECONDS}, stale-while-revalidate=${WEATHER_REVALIDATE_SECONDS}`,
    },
  });
}
