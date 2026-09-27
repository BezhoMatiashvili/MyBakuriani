import { fetchDrivingRoute, type LatLng } from "@/lib/maps/directions";
import {
  BAKURIANI_DESTINATION,
  classifyTraffic,
  inRange,
  type PersonalizedRoad,
} from "@/lib/road-condition/shared";

// Personalized counterpart to server.ts's fixed Tbilisi->Bakuriani card.
// Client-safe (no `server-only`): runs from the browser, per visitor, only
// after location consent (see src/lib/geolocation/useUserLocation.ts).

// Below this, "X minutes from Bakuriani" would be a nonsense reading - the
// visitor is already there.
const ALREADY_THERE_METERS = 3000;

// Looser than server.ts's fixed-origin bounds (100km/1h minimums): an
// arbitrary visitor can legitimately be much closer (Borjomi) or much
// farther (anywhere reachable by road) than a Tbilisi-only corridor assumes.
const MIN_DURATION_SECONDS = 0;
const MAX_DURATION_SECONDS = 48 * 60 * 60;
const MIN_DISTANCE_METERS = 0;
const MAX_DISTANCE_METERS = 5_000_000;

async function reverseGeocode(origin: LatLng): Promise<string> {
  try {
    const params = new URLSearchParams({
      lat: String(origin.lat),
      lng: String(origin.lng),
    });
    const res = await fetch(`/api/geocode?${params}`);
    if (!res.ok) return "";
    const payload = (await res.json()) as { display_name?: string | null };
    return typeof payload.display_name === "string" ? payload.display_name : "";
  } catch {
    return "";
  }
}

/**
 * Returns null on any failure (no route, implausible values, network) so the
 * caller falls back to the fixed Tbilisi card - never a broken card.
 */
export async function fetchPersonalizedRoad(
  origin: LatLng,
  mapboxToken: string,
): Promise<PersonalizedRoad | null> {
  const route = await fetchDrivingRoute(
    origin,
    BAKURIANI_DESTINATION,
    mapboxToken,
  );
  if (!route) return null;

  if (route.distanceMeters < ALREADY_THERE_METERS) {
    return { kind: "already-there" };
  }

  if (
    !inRange(
      route.durationSeconds,
      MIN_DURATION_SECONDS,
      MAX_DURATION_SECONDS,
    ) ||
    !inRange(route.distanceMeters, MIN_DISTANCE_METERS, MAX_DISTANCE_METERS)
  ) {
    return null;
  }

  const placeName = await reverseGeocode(origin);
  return {
    kind: "route",
    placeName,
    condition: {
      durationSeconds: route.durationSeconds,
      distanceMeters: route.distanceMeters,
      durationTypicalSeconds: route.durationTypicalSeconds,
      trafficStatus: classifyTraffic(
        route.durationSeconds,
        route.durationTypicalSeconds,
      ),
    },
  };
}
