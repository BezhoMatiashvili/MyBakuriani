// Deep-links to Google Maps directions. Pure and dependency-free; used by the
// personalized road card's map (with the visitor's origin) and every listing
// map's "Google Maps-ში გახსნა" link (destination only).

export interface LatLng {
  lat: number;
  lng: number;
}

const coord = (point: LatLng) => `${point.lat},${point.lng}`;

/**
 * Without `origin`, Google Maps falls back to the device's own location -
 * so this still works as a "get directions here" link for a visitor who
 * declined our location permission, just without a pre-filled starting point.
 */
export function googleMapsDirectionsUrl(
  destination: LatLng,
  origin?: LatLng | null,
): string {
  const params = new URLSearchParams({
    api: "1",
    destination: coord(destination),
    travelmode: "driving",
  });
  if (origin) params.set("origin", coord(origin));
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}
