import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import {
  ApiError,
  buildCorsHeaders,
  createServiceClient,
  errorResponse,
  getBearerToken,
  jsonResponse,
} from "../_shared/guards.ts";

// Every-30-min road-condition job. Calls the Google Routes API (traffic-aware)
// for the Tbilisi -> Bakuriani drive, classifies congestion from the ratio of
// live duration to free-flow staticDuration, and upserts one row into
// public.road_conditions. The public landing hero reads that row and overlays it
// onto the admin-managed "road" status card (src/lib/road-condition/server.ts) —
// same shape as the live weather card, but DB-backed because Routes is a paid API.
//
// Auth: shared secret in ROAD_CONDITION_SECRET (Bearer header). The cron job and
// any manual invocations must present this token. Deploy with verify_jwt=false
// (the Bearer is the shared secret, not a Supabase JWT).
//
// On any Google error / empty route the existing row is left untouched so the
// last-known-good value survives an outage; the display falls back to the
// admin/default card value while status_code stays 'unknown'.

const ROUTE_SLUG = "tbilisi_bakuriani";

// Tbilisi city centre -> Bakuriani ski resort town centre.
const ORIGIN = { latitude: 41.7151, longitude: 44.8271 };
const DESTINATION = { latitude: 41.7497, longitude: 43.5386 };

const ROUTES_ENDPOINT =
  "https://routes.googleapis.com/directions/v2:computeRoutes";

// Congestion thresholds on ratio = liveDuration / freeFlowDuration.
const MODERATE_RATIO = 1.15;
const HEAVY_RATIO = 1.4;

type StatusCode = "clear" | "moderate" | "heavy";

function requireSharedSecret(req: Request) {
  const expected = Deno.env.get("ROAD_CONDITION_SECRET");
  if (!expected) {
    throw new ApiError(
      "ROAD_CONDITION_SECRET is not configured",
      500,
      "ENV_MISSING",
    );
  }
  const token = getBearerToken(req);
  if (token !== expected) {
    throw new ApiError("Invalid shared secret", 401, "AUTH_UNAUTHORIZED");
  }
}

function requireApiKey(): string {
  const key = Deno.env.get("GOOGLE_MAPS_API_KEY");
  if (!key) {
    throw new ApiError(
      "GOOGLE_MAPS_API_KEY is not configured",
      500,
      "ENV_MISSING",
    );
  }
  return key;
}

// Google returns durations as protobuf strings like "13200s".
function parseSeconds(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const match = value.match(/^(\d+(?:\.\d+)?)s$/);
  if (!match) return null;
  const n = Number(match[1]);
  return Number.isFinite(n) ? n : null;
}

function classify(ratio: number): StatusCode {
  if (ratio < MODERATE_RATIO) return "clear";
  if (ratio < HEAVY_RATIO) return "moderate";
  return "heavy";
}

interface RouteRow {
  distanceMeters?: number;
  duration?: string;
  staticDuration?: string;
}

async function fetchRoute(apiKey: string): Promise<RouteRow | null> {
  const res = await fetch(ROUTES_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      // Omitting departureTime: with TRAFFIC_AWARE it defaults to "now". A
      // client-computed timestamp is already in the past on arrival and rejected.
      "X-Goog-FieldMask":
        "routes.duration,routes.staticDuration,routes.distanceMeters",
    },
    body: JSON.stringify({
      origin: { location: { latLng: ORIGIN } },
      destination: { location: { latLng: DESTINATION } },
      travelMode: "DRIVE",
      routingPreference: "TRAFFIC_AWARE",
      units: "METRIC",
    }),
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    console.error(
      JSON.stringify({ scope: "road-condition", status: res.status, detail }),
    );
    return null;
  }

  const json = (await res.json()) as { routes?: RouteRow[] };
  return json.routes?.[0] ?? null;
}

serve(async (req) => {
  const cors = buildCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cors });
  }

  try {
    requireSharedSecret(req);
    const apiKey = requireApiKey();
    const db = createServiceClient();

    const route = await fetchRoute(apiKey);

    const liveSeconds = parseSeconds(route?.duration);
    const staticSeconds = parseSeconds(route?.staticDuration);

    // No usable route (outage / closure detour with missing fields) — keep the
    // last-known-good row untouched.
    if (!route || liveSeconds === null || !staticSeconds) {
      return jsonResponse({ ok: true, skipped: true }, 200, cors);
    }

    const ratio = liveSeconds / staticSeconds;
    const statusCode = classify(ratio);

    const { error } = await db.from("road_conditions").upsert(
      {
        route_slug: ROUTE_SLUG,
        status_code: statusCode,
        duration_seconds: Math.round(liveSeconds),
        static_duration_seconds: Math.round(staticSeconds),
        distance_meters:
          typeof route.distanceMeters === "number"
            ? route.distanceMeters
            : null,
        ratio,
        computed_at: new Date().toISOString(),
        source: "google_routes",
      },
      { onConflict: "route_slug" },
    );

    if (error) throw error;

    return jsonResponse(
      {
        ok: true,
        status_code: statusCode,
        duration_seconds: Math.round(liveSeconds),
        static_duration_seconds: Math.round(staticSeconds),
        ratio: Number(ratio.toFixed(3)),
      },
      200,
      cors,
    );
  } catch (err) {
    return errorResponse(err, cors);
  }
});
