export const SEARCH_LOCATION_ZONES = [
  "დიდველი / კრისტალი",
  "ცენტრი / პარკი",
  "კოხტა / მიტარბი",
  "25-იანები",
] as const;

export type SearchLocationZone = (typeof SEARCH_LOCATION_ZONES)[number];

// Approximate zone centres used to bucket properties by nearest-centre on
// lat/lng (the `properties` table has no zone column). Matches the seed
// in supabase/migrations/005_seed_property_coordinates.sql.
export const ZONE_CENTERS: Record<
  SearchLocationZone,
  { lat: number; lng: number }
> = {
  "დიდველი / კრისტალი": { lat: 41.7385, lng: 43.5175 },
  "ცენტრი / პარკი": { lat: 41.7509, lng: 43.5294 },
  "კოხტა / მიტარბი": { lat: 41.758, lng: 43.545 },
  "25-იანები": { lat: 41.746, lng: 43.538 },
};
