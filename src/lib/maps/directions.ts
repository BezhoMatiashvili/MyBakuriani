// Client-side Mapbox Directions fetch, shared by the personalized road-status
// card (src/lib/road-condition/personalized.ts) and every map's "show me the
// route" button (BakurianiMap.tsx). Deliberately separate from
// src/lib/road-condition/server.ts's own server-side fetch: that one runs
// behind React's cache()+next:{revalidate} using the secret MAPBOX_ACCESS_TOKEN
// for a single fixed route; this one runs per-visitor in the browser using the
// public NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN (the same token BakurianiMap already
// sends to Mapbox for tiles/styles - CSP connect-src already allows
// api.mapbox.com, see src/middleware.ts).
//
// `driving-traffic` (not plain `driving`) so a drawn route's ETA matches the
// road card's traffic-aware numbers.

export interface LatLng {
  lat: number;
  lng: number;
}

/**
 * Minimal, self-contained LineString shape (not the ambient `GeoJSON`
 * namespace some `.d.ts` files declare - that namespace is scoped to files
 * that import "mapbox-gl" and isn't visible here). Structurally compatible
 * with mapbox-gl's own GeoJSON geometry type, so it drops straight into an
 * `addSource({ type: "geojson", data: { type: "Feature", geometry, ... } } )`
 * call without a cast.
 */
export interface RouteLineString {
  type: "LineString";
  coordinates: [number, number][];
}

export interface DrivingRoute {
  /** [lng, lat] pairs, ready to hand to a Mapbox GL GeoJSON line source. */
  geojson: RouteLineString;
  distanceMeters: number;
  durationSeconds: number;
  durationTypicalSeconds: number | null;
}

interface MapboxDirectionsGeometryResponse {
  code?: string;
  routes?: {
    distance?: number;
    duration?: number;
    duration_typical?: number;
    geometry?: RouteLineString;
  }[];
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isLineString(value: unknown): value is RouteLineString {
  if (!value || typeof value !== "object") return false;
  const geometry = value as { type?: unknown; coordinates?: unknown };
  return (
    geometry.type === "LineString" &&
    Array.isArray(geometry.coordinates) &&
    geometry.coordinates.length >= 2
  );
}

const DEFAULT_TIMEOUT_MS = 6000;

/**
 * Fetches a driving route's geometry + ETA between two points. Returns null
 * on any failure (network, timeout, no route, malformed shape) - callers
 * degrade gracefully (no line drawn / destination-only Google Maps link)
 * rather than surfacing an error.
 */
export async function fetchDrivingRoute(
  origin: LatLng,
  destination: LatLng,
  token: string,
  { timeoutMs = DEFAULT_TIMEOUT_MS }: { timeoutMs?: number } = {},
): Promise<DrivingRoute | null> {
  if (!token) return null;

  const coords = `${origin.lng},${origin.lat};${destination.lng},${destination.lat}`;
  const url =
    `https://api.mapbox.com/directions/v5/mapbox/driving-traffic/${coords}` +
    `?overview=full&geometries=geojson&alternatives=false&steps=false&access_token=${encodeURIComponent(token)}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return null;

    const payload = (await res
      .json()
      .catch(() => null)) as MapboxDirectionsGeometryResponse | null;
    if (!payload || payload.code !== "Ok") return null;

    const route = payload.routes?.[0];
    if (
      !route ||
      !isFiniteNumber(route.distance) ||
      !isFiniteNumber(route.duration) ||
      !isLineString(route.geometry)
    ) {
      return null;
    }

    return {
      geojson: route.geometry,
      distanceMeters: route.distance,
      durationSeconds: route.duration,
      durationTypicalSeconds: isFiniteNumber(route.duration_typical)
        ? route.duration_typical
        : null,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
