import type { Json } from "@/lib/types/database";
import type { LatLng } from "./googleMapsUrl";

/**
 * `services.coords` (jsonb `{lat, lng}`, written by the food and
 * entertainment forms' ExactLocationPicker) as a point, or null when it is
 * missing or not a finite pair on the globe.
 */
export function parseServiceCoords(
  value: Json | null | undefined,
): LatLng | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const { lat, lng } = value as Record<string, unknown>;
  if (typeof lat !== "number" || typeof lng !== "number") return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
}
