import "server-only";
import { cache } from "react";
import { unstable_cache } from "next/cache";
import { createPublicClient } from "@/lib/supabase/server";
import { DEFAULT_STATUS_CARDS, type StatusCard } from "./types";

export { DEFAULT_STATUS_CARDS, type StatusCard };

export const STATUS_CARDS_SETTING_KEY = "status_cards";

// Reads the admin-managed status cards from site_settings, returning only the
// active ones. Falls back to DEFAULT_STATUS_CARDS on any error or empty row so
// the public hero never renders blank (mirrors getActiveZones / FALLBACK_ZONES).
//
// unstable_cache (60s): site-global, rarely-changing data also read by the
// per-request dynamic routes (/search, /sales/all) — without it each of those
// requests paid a DB round-trip. cache() on top keeps the per-request memo.
const getStatusCardsCached = unstable_cache(
  async (): Promise<StatusCard[]> => {
    try {
      const db = createPublicClient();
      const { data, error } = await db
        .from("site_settings")
        .select("value")
        .eq("key", STATUS_CARDS_SETTING_KEY)
        .maybeSingle();

      if (error || !data) return DEFAULT_STATUS_CARDS;

      const value = data.value as { cards?: unknown } | null;
      const cards = value?.cards;
      if (!Array.isArray(cards) || cards.length === 0) {
        return DEFAULT_STATUS_CARDS;
      }

      return (cards as StatusCard[]).filter((card) => card?.active !== false);
    } catch {
      return DEFAULT_STATUS_CARDS;
    }
  },
  ["status-cards"],
  { revalidate: 60 },
);

export const getStatusCards = cache(getStatusCardsCached);
