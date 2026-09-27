import { NextRequest } from "next/server";
import { timeoutFetch } from "@/lib/with-timeout";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";

export const runtime = "nodejs";

// ── Forward geocoding via Photon (OpenStreetMap) ──
// Backs the type-ahead suggestions in ExactLocationPicker. Proxied
// server-side so we can send a descriptive User-Agent, bias results to
// Bakuriani, cache identical queries, and time-bound the request. No API key.
//
// Why Photon: the picker stores the chosen coordinates on the listing, so the
// data must be storable. OSM data (ODbL) is, with the "© OpenStreetMap" credit
// the picker already shows. Nominatim's usage policy forbids autocomplete,
// Mapbox Search Box results are temporary-use only, and Google Places may not
// be shown on a non-Google map.
//
// Scaling note: the public Photon instance is fair-use ("extensive usage will
// be throttled", no availability guarantee). The client debounces keystrokes,
// enforces a 3-char minimum, and responses carry a 24h Cache-Control (per
// browser/CDN, not a shared server cache). If traffic grows materially,
// self-host Photon or move to a keyed provider.
const PHOTON_URL = "https://photon.komoot.io/api/";

// Soft bias toward Bakuriani; results are limited to Georgia's bounding box
// (minLon,minLat,maxLon,maxLat) and then filtered to countrycode GE, since the
// box also covers parts of neighbouring countries.
const BAKURIANI_LAT = 41.7509;
const BAKURIANI_LNG = 43.5294;
const GEORGIA_BBOX = "39.9,41.0,46.8,43.6";

// Photon's lat/lon bias is weak (a Tsalka "კოხტა" outranks Bakuriani's), so
// places within ~20 km of Bakuriani are moved to the top.
function nearBakuriani(r: { lat: number; lng: number }): boolean {
  return (
    Math.abs(r.lat - BAKURIANI_LAT) < 0.18 &&
    Math.abs(r.lng - BAKURIANI_LNG) < 0.24
  );
}

const MAX_RESULTS = 6;

const REQUEST_HEADERS = {
  "User-Agent": "MyBakuriani/1.0 (https://mybakuriani.ge)",
  Referer: "https://mybakuriani.ge",
  Accept: "application/json",
};

interface GeocodeResult {
  display_name: string;
  lat: number;
  lng: number;
}

interface PhotonFeature {
  geometry?: { coordinates?: [number, number] }; // GeoJSON order: [lon, lat]
  properties?: {
    name?: string;
    street?: string;
    housenumber?: string;
    locality?: string;
    district?: string;
    city?: string;
    county?: string;
    countrycode?: string;
  };
}

// Photon has no display_name; build "name, street 12, locality, city" from
// whichever parts exist, skipping repeats (a street's name is its street).
function displayName(p: NonNullable<PhotonFeature["properties"]>): string {
  const street = [p.street, p.housenumber].filter(Boolean).join(" ");
  const parts = [p.name, street, p.locality ?? p.district, p.city ?? p.county];
  return [...new Set(parts.filter((x): x is string => !!x?.trim()))].join(", ");
}

// ── Reverse geocoding (lat/lng -> place name) ──
// Backs the personalized road-status card (src/lib/road-condition/
// personalized.ts): naming the visitor's location for "გზა <ადგილი>-დან".
// Same Photon instance, same headers, same rate limiter as the forward path
// above - just the opposite direction. Unlike the forward path, results are
// NOT filtered to Georgia: a driving origin can reasonably be outside it.
const REVERSE_URL = "https://photon.komoot.io/reverse";

function isFiniteCoord(value: string | null, max: number): number | null {
  if (value === null) return null;
  const n = Number(value);
  return Number.isFinite(n) && Math.abs(n) <= max ? n : null;
}

async function reverseGeocode(lat: number, lng: number): Promise<Response> {
  try {
    const params = new URLSearchParams({
      lon: String(lng),
      lat: String(lat),
    });
    const res = await timeoutFetch(5000)(`${REVERSE_URL}?${params}`, {
      headers: REQUEST_HEADERS,
    });
    if (!res.ok) {
      return Response.json(
        { error: "geocoding unavailable", display_name: null },
        { status: 502 },
      );
    }
    const raw = (await res.json()) as { features?: PhotonFeature[] };
    const feature = Array.isArray(raw?.features) ? raw.features[0] : null;
    const name = feature ? displayName(feature.properties ?? {}) : "";
    return Response.json(
      { display_name: name || null },
      {
        headers: {
          "Cache-Control":
            "public, max-age=86400, stale-while-revalidate=86400",
        },
      },
    );
  } catch (error) {
    console.error("GET /api/geocode (reverse) failed", error);
    return Response.json(
      { error: "geocoding unavailable", display_name: null },
      { status: 502 },
    );
  }
}

export async function GET(req: NextRequest) {
  if (!(await checkRateLimit(`geocode:${getClientIp(req)}`, 60, 60_000))) {
    return Response.json(
      { error: "rate limited", results: [] },
      { status: 429 },
    );
  }

  const lat = isFiniteCoord(req.nextUrl.searchParams.get("lat"), 90);
  const lng = isFiniteCoord(req.nextUrl.searchParams.get("lng"), 180);
  if (lat !== null && lng !== null) {
    return reverseGeocode(lat, lng);
  }

  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";

  // Treated as empty-state by the client; also shields Photon from junk
  // single/double-character queries. No long cache so a corrected typo
  // re-searches immediately.
  if (q.length < 3) {
    return Response.json({ results: [] });
  }

  try {
    const params = new URLSearchParams({
      q: q.slice(0, 200),
      limit: "10", // headroom for the GE filter and de-duplication below
      lat: String(BAKURIANI_LAT),
      lon: String(BAKURIANI_LNG),
      bbox: GEORGIA_BBOX,
    });

    const res = await timeoutFetch(5000)(`${PHOTON_URL}?${params}`, {
      headers: REQUEST_HEADERS,
    });

    if (!res.ok) {
      return Response.json(
        { error: "geocoding unavailable", results: [] },
        { status: 502 },
      );
    }

    // Round to 6 decimals to match the precision used everywhere else in the
    // location picker.
    const raw = (await res.json()) as { features?: PhotonFeature[] };
    const seen = new Set<string>();
    const results: GeocodeResult[] = [];
    for (const f of Array.isArray(raw?.features) ? raw.features : []) {
      const [lon, lat] = f.geometry?.coordinates ?? [];
      const props = f.properties ?? {};
      if (props.countrycode !== "GE") continue;
      const r = {
        display_name: displayName(props),
        lat: Number(Number(lat).toFixed(6)),
        lng: Number(Number(lon).toFixed(6)),
      };
      if (!r.display_name || !Number.isFinite(r.lat) || !Number.isFinite(r.lng))
        continue;
      if (seen.has(r.display_name)) continue;
      seen.add(r.display_name);
      results.push(r);
    }
    results.sort((a, b) => Number(nearBakuriani(b)) - Number(nearBakuriani(a)));

    return Response.json(
      { results: results.slice(0, MAX_RESULTS) },
      {
        // Identical queries are effectively static; caching keeps us within
        // Photon's fair-use limits.
        headers: {
          "Cache-Control":
            "public, max-age=86400, stale-while-revalidate=86400",
        },
      },
    );
  } catch (error) {
    console.error("GET /api/geocode failed", error);
    return Response.json(
      { error: "geocoding unavailable", results: [] },
      { status: 502 },
    );
  }
}
