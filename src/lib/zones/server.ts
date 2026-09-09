import { cache } from "react";
import { unstable_cache } from "next/cache";
import { createPublicClient } from "@/lib/supabase/server";
import {
  FALLBACK_ZONES,
  nearestZoneFrom,
  nearestZoneName,
  type Zone,
  type ZoneIcon,
} from "@/lib/zones/types";

export {
  FALLBACK_ZONES,
  nearestZoneFrom,
  nearestZoneName,
  type Zone,
  type ZoneIcon,
};

function normaliseIcon(value: string): ZoneIcon {
  return value === "tree" || value === "pin" ? value : "mountain";
}

// unstable_cache (60s): zones change only via the admin panel; the per-request
// dynamic routes (/search) read them on every request otherwise. cache() on
// top keeps the per-request memo.
const getActiveZonesCached = unstable_cache(
  async (): Promise<Zone[]> => {
    try {
      const db = createPublicClient();
      const { data, error } = await db
        .from("zones")
        .select(
          "id, slug, name_ka, description_ka, lat, lng, icon, sort_order, is_active, price_per_sqm_override",
        )
        .eq("is_active", true)
        .order("sort_order", { ascending: true });
      if (error || !data || data.length === 0) {
        return FALLBACK_ZONES;
      }
      return data.map((row) => ({
        ...row,
        icon: normaliseIcon(row.icon),
        price_per_sqm_override: row.price_per_sqm_override ?? null,
      }));
    } catch {
      return FALLBACK_ZONES;
    }
  },
  ["active-zones"],
  { revalidate: 60 },
);

export const getActiveZones = cache(getActiveZonesCached);
