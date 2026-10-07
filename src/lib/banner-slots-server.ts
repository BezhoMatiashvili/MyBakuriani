import "server-only";
import { cache } from "react";
import { unstable_cache } from "next/cache";
import { createServiceClient } from "@/lib/supabase/admin";
import {
  adRowToCreative,
  landingBannerToCreative,
  type BannerCreative,
} from "@/lib/banner-creative";
import { selectLiveCreatives } from "@/lib/banner-placements";

/**
 * Every active creative on the site, from BOTH banner tables, normalized.
 *
 * The whole active set is single-digit rows, so one query pair serves every
 * placement — a page with three slots costs one fetch, not three.
 *
 * Column lists are explicit on purpose: `ads` carries `views_count`,
 * `clicks_count` and `created_by`, none of which belong in an anonymous
 * response. Do not switch these to select("*").
 */
// unstable_cache (60s): the active set is tiny and the API route in front of
// this already serves with s-maxage=60, so a 60s server-side cache adds no new
// staleness — it only removes the per-request query pair on dynamic renders.
// The start/end window filters below run against the time of the cached
// render, which is ≤60s old; that skew is within the existing budget.
const fetchSlotCreativesCached = unstable_cache(
  async (): Promise<BannerCreative[]> => {
    const db = createServiceClient();
    const nowIso = new Date().toISOString();

    const [bannerRes, adRes] = await Promise.all([
      db
        .from("landing_banners")
        .select(
          "id, placement, kind, title, body, cta_label, cta_href, image_url, video_url, video_poster_url, tone, sort_order, start_at, end_at, created_at",
        )
        .eq("active", true)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: false }),
      db
        .from("ads")
        // `status` must be filtered here, not just relied on via RLS: the service
        // client bypasses RLS entirely, so the "ads public read active" policy
        // never runs. Without this, pausing an ad would do nothing publicly.
        .select(
          "id, placement, position, title, url, banner_url, start_at, end_at, status, created_at, sov_percent, priority, frequency_cap_per_day",
        )
        .eq("status", "active")
        .lte("start_at", nowIso)
        .gte("end_at", nowIso),
    ]);

    const creatives: BannerCreative[] = [];

    // A failing query yields no creatives for that source rather than throwing —
    // banners are decorative, and a DB hiccup must not take down a page.
    if (!bannerRes.error && bannerRes.data) {
      for (const row of bannerRes.data) {
        const creative = landingBannerToCreative(row);
        if (creative) creatives.push(creative);
      }
    }

    if (!adRes.error && adRes.data) {
      for (const row of adRes.data) {
        const creative = adRowToCreative(row);
        if (creative) creatives.push(creative);
      }
    }

    // Schedule window, known placement, media where the placement needs it
    // (leaderboard / sidebar / in-grid draw nothing without one, which is what
    // contains the legacy ad rows whose banner_url is a page URL), and render
    // order. Shared with the admin pages so their "shown / not shown" state is
    // this exact decision (src/lib/banner-placements.ts).
    return selectLiveCreatives(creatives, Date.now());
  },
  ["banner-slot-creatives"],
  { revalidate: 60 },
);

export const fetchSlotCreatives = cache(fetchSlotCreativesCached);
