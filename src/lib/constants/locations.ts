export const SEARCH_LOCATION_ZONES = [
  "დიდველი / კრისტალი",
  "ცენტრი / პარკი",
  "კოხტა / მიტარბი",
  "25-იანები",
] as const;

export type SearchLocationZone = (typeof SEARCH_LOCATION_ZONES)[number];
