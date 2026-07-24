import { NextRequest } from "next/server";
import { timeoutFetch } from "@/lib/with-timeout";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";

export const runtime = "nodejs";

// ── Forward geocoding via Nominatim (OpenStreetMap) ──
// Proxied server-side so we can send the descriptive User-Agent that
// Nominatim's usage policy requires, bias results to Bakuriani, cache
// aggressively, and time-bound the request. No API key — matches the
// OSM/CARTO map stack already used across the site.
//
// Scaling note: the public Nominatim instance allows at most ~1 req/s and
// forbids heavy use. This route is button-triggered (not type-ahead), enforces
// a 3-char minimum, and caches identical queries for 24h, which keeps us well
// within policy at this site's scale. If traffic grows materially, switch to a
// self-hosted Nominatim or a keyed provider (MapTiler / Geoapify).
const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";

// Bakuriani bounding box for a soft search bias (~±10km), in Nominatim's
// lon,lat order: minLon,maxLat,maxLon,minLat. Centered on 41.7509, 43.5294.
const NOMINATIM_VIEWBOX = "43.4094,41.8309,43.6494,41.6709";

const REQUEST_HEADERS = {
  // Verify the production domain before shipping if it changes.
  "User-Agent":
    "MyBakuriani/1.0 (https://my-bakuriani.vercel.app; beji.matiashvili@gmail.com)",
  Referer: "https://my-bakuriani.vercel.app",
  Accept: "application/json",
};

interface GeocodeResult {
  display_name: string;
  lat: number;
  lng: number;
}

export async function GET(req: NextRequest) {
  if (!(await checkRateLimit(`geocode:${getClientIp(req)}`, 20, 60_000))) {
    return Response.json(
      { error: "rate limited", results: [] },
      { status: 429 },
    );
  }

  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";

  // Treated as empty-state by the client; also shields Nominatim from junk
  // single/double-character queries. No long cache so a corrected typo
  // re-searches immediately.
  if (q.length < 3) {
    return Response.json({ results: [] });
  }

  try {
    const params = new URLSearchParams({
      q: q.slice(0, 200),
      format: "jsonv2",
      limit: "5",
      addressdetails: "0",
      "accept-language": "ka",
      viewbox: NOMINATIM_VIEWBOX,
      bounded: "0", // soft bias: prefer Bakuriani, still resolve nearby places
    });

    const res = await timeoutFetch(5000)(`${NOMINATIM_URL}?${params}`, {
      headers: REQUEST_HEADERS,
    });

    if (!res.ok) {
      return Response.json(
        { error: "geocoding unavailable", results: [] },
        { status: 502 },
      );
    }

    // Nominatim returns lat/lon as strings — coerce and round to 6 decimals to
    // match the precision used everywhere else in the location picker.
    const raw = (await res.json()) as Array<{
      display_name: string;
      lat: string;
      lon: string;
    }>;
    const results: GeocodeResult[] = (Array.isArray(raw) ? raw : [])
      .map((d) => ({
        display_name: d.display_name,
        lat: Number(Number(d.lat).toFixed(6)),
        lng: Number(Number(d.lon).toFixed(6)),
      }))
      .filter((r) => Number.isFinite(r.lat) && Number.isFinite(r.lng));

    return Response.json(
      { results },
      {
        // Identical queries are effectively static; caching is the main
        // safeguard against Nominatim's rate limit.
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
