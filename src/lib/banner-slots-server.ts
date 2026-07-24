import "server-only";
import { cache } from "react";
import { createServiceClient } from "@/lib/supabase/admin";
import {
  adRowToCreative,
  creativeHasMedia,
  landingBannerToCreative,
  type BannerCreative,
} from "@/lib/banner-creative";
import { getPlacementSpec } from "@/lib/banner-placements";

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
export const fetchSlotCreatives = cache(async (): Promise<BannerCreative[]> => {
  const db = createServiceClient();
  const nowIso = new Date().toISOString();

  const [bannerRes, adRes] = await Promise.all([
    db
      .from("landing_banners")
      .select(
        "id, placement, kind, title, body, cta_label, cta_href, image_url, video_url, video_poster_url, tone, sort_order, start_at, end_at",
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
        "id, placement, position, title, url, banner_url, start_at, end_at, status",
      )
      .eq("status", "active")
      .lte("start_at", nowIso)
      .gte("end_at", nowIso),
  ]);

  const now = Date.now();
  const creatives: BannerCreative[] = [];

  // A failing query yields no creatives for that source rather than throwing —
  // banners are decorative, and a DB hiccup must not take down a page.
  if (!bannerRes.error && bannerRes.data) {
    for (const row of bannerRes.data) {
      const startOk = !row.start_at || new Date(row.start_at).getTime() <= now;
      const endOk = !row.end_at || new Date(row.end_at).getTime() >= now;
      if (!startOk || !endOk) continue;
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

  // A creative with no renderable media is dropped server-side rather than
  // reaching the client and rendering an empty box. This is what contains the
  // legacy ad rows whose banner_url is a page URL, not an image.
  //
  // `strip`, `sticky` and `promo-card` are text-driven and render fine without
  // media — promo-card lays out title/body/CTA and treats the media column as
  // optional, exactly as the pre-placement PromoBanners did. Requiring media
  // here would let the admin save and PREVIEW a text-only promo banner that
  // then never appears, which is the "preview lies" failure this whole design
  // exists to prevent. Only the media-first styles (leaderboard, sidebar,
  // in-grid) are genuinely nothing-without-an-image.
  const TEXT_CAPABLE_STYLES = ["strip", "sticky", "promo-card"];

  return creatives
    .filter((creative) => {
      const spec = getPlacementSpec(creative.placement);
      if (!spec) return false;
      if (TEXT_CAPABLE_STYLES.includes(spec.renderStyle)) return true;
      return creativeHasMedia(creative);
    })
    .sort((a, b) => {
      if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
      // Tie-break paid ahead of editorial. Ads are all sortOrder 0 and Array
      // .sort is stable, so without this an editorial banner would always win a
      // single-creative slot (leaderboard / sidebar / in-grid) against a paid
      // ad — backwards for a monetised placement.
      return Number(b.sponsored) - Number(a.sponsored);
    });
});
