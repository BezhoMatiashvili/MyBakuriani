export type ZoneIcon = "mountain" | "tree" | "pin";

export interface Zone {
  id: string;
  slug: string;
  name_ka: string;
  description_ka: string;
  lat: number;
  lng: number;
  icon: ZoneIcon;
  sort_order: number;
  is_active: boolean;
}

// Last-resort fallback list. Matches the 4 seeded zones in
// 20260517120000_zones_table.sql. Safe to import from client or server.
// NOTE (i18n): name_ka / description_ka are data values mirroring DB rows —
// resolveZone() matches listing free-text against name_ka, so these must
// stay Georgian and are intentionally not moved to translation messages.
export const FALLBACK_ZONES: Zone[] = [
  {
    id: "fallback-didveli",
    slug: "didveli",
    name_ka: "დიდველი / კრისტალი",
    description_ka: "ტრასასთან ახლოს, საბაგირეს ხედვით",
    lat: 41.7385,
    lng: 43.5175,
    icon: "mountain",
    sort_order: 1,
    is_active: true,
  },
  {
    id: "fallback-centri",
    slug: "centri",
    name_ka: "ცენტრი / პარკი",
    description_ka: "გართობა, რესტორნები და ცენტრალური პარკი",
    lat: 41.7509,
    lng: 43.5294,
    icon: "tree",
    sort_order: 2,
    is_active: true,
  },
  {
    id: "fallback-kokhta",
    slug: "kokhta",
    name_ka: "კოხტა / მიტარბი",
    description_ka: "პრემიუმ ფარეხი და ახალი საბაგიროები",
    lat: 41.758,
    lng: 43.545,
    icon: "mountain",
    sort_order: 3,
    is_active: true,
  },
  {
    id: "fallback-25",
    slug: "25ianebi",
    name_ka: "25-იანები",
    description_ka: "იაფფასიანი ბინები და დამწყებთათვის",
    lat: 41.746,
    lng: 43.538,
    icon: "pin",
    sort_order: 4,
    is_active: true,
  },
];

export function nearestZoneFrom(
  zones: Zone[],
  lat: number,
  lng: number,
): Zone | null {
  if (zones.length === 0) return null;
  let best = zones[0];
  let bestDist = Infinity;
  for (const z of zones) {
    const dLat = lat - z.lat;
    const dLng = lng - z.lng;
    const d = dLat * dLat + dLng * dLng;
    if (d < bestDist) {
      bestDist = d;
      best = z;
    }
  }
  return best;
}

export function nearestZoneName(
  zones: Zone[],
  lat: number,
  lng: number,
): string | null {
  return nearestZoneFrom(zones, lat, lng)?.name_ka ?? null;
}

// Resolve a listing's zone from possibly-messy free-text + optional coords.
// Priority: exact name_ka → name_ka as substring → any "/"-token of name_ka
// as substring → nearest zone by coords. Returns null when nothing matches
// and no coords are available.
export function resolveZone(
  zones: Zone[],
  location: string | null | undefined,
  lat?: number | null,
  lng?: number | null,
): Zone | null {
  if (zones.length === 0) return null;
  const text = location?.trim();
  if (text) {
    const lower = text.toLowerCase();
    const exact = zones.find((z) => z.name_ka === text);
    if (exact) return exact;
    const sub = zones.find((z) => lower.includes(z.name_ka.toLowerCase()));
    if (sub) return sub;
    const tok = zones.find((z) =>
      z.name_ka
        .split(" / ")
        .some((token) => lower.includes(token.toLowerCase())),
    );
    if (tok) return tok;
  }
  if (typeof lat === "number" && typeof lng === "number") {
    return nearestZoneFrom(zones, lat, lng);
  }
  return null;
}
