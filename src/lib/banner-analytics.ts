/**
 * Ad & banner analytics (contract C46): the vocabulary shared by the public
 * beacon, the track route, the admin read route and the admin pages.
 *
 * Pure on purpose (no `@/` imports) so scripts/unit/banner-analytics.test.mjs
 * can import it and compare these lists with the migration's RPCs.
 *
 * What the numbers mean (same for paid ads and editorial banners):
 *   view  — at least half the creative was on screen for 1 s
 *   open  — the visitor opened its detail window
 *   click — the visitor followed its link (the ad itself, a CTA button, or the
 *           CTA inside the detail window)
 * Each is counted once per browser tab session per creative, so a view is
 * "a session that saw it", not every render.
 *
 * The media plan's report (C47, §6) adds, from the same beacon:
 *   impressions — every viewable display (a view is the first of them in a
 *                 tab session)
 *   reach       — the first viewable display of that creative on a device
 *                 ("unique users"; summed over creatives it double-counts)
 *   slot_impressions — every viewable display of the placement's ad position,
 *                 filled or not: the denominator of an ad's actual SOV
 * CTR = clicks / impressions.
 */

export const BANNER_EVENTS = ["view", "open", "click"] as const;
export type BannerEvent = (typeof BANNER_EVENTS)[number];

/**
 * The batched beacon's event types (record_banner_events): `imp` an
 * impression (flags s = first in session, r = first on device, slot = it is
 * the placement's ad position), `open`, `click`, and `empty` (an ad position
 * seen with nothing drawn into it).
 */
export const BANNER_BATCH_TYPES = ["imp", "open", "click", "empty"] as const;
export type BannerBatchType = (typeof BANNER_BATCH_TYPES)[number];
/** record_banner_events refuses a longer batch (22023). */
export const BANNER_BATCH_MAX = 50;

export const BANNER_SOURCES = ["ad", "banner"] as const;
export type BannerSource = (typeof BANNER_SOURCES)[number];

/** Day presets on the admin page; a custom range is also accepted. */
export const BANNER_ANALYTICS_PRESETS = [7, 30, 90] as const;
export const BANNER_ANALYTICS_DEFAULT_DAYS = 30;
/** `admin_banner_analytics` refuses p_to - p_from > 365 (366 days inclusive). */
export const BANNER_ANALYTICS_MAX_DAYS = 366;

export type BannerCreativeStatus =
  "live" | "scheduled" | "paused" | "off" | "expired" | "deleted";

export type BannerCounts = {
  views: number;
  opens: number;
  clicks: number;
  impressions: number;
};

export type BannerAnalyticsCreative = BannerCounts & {
  source: BannerSource;
  id: string;
  /** null once the creative row was deleted. */
  title: string | null;
  placement: string | null;
  status: BannerCreativeStatus;
  start_at: string | null;
  end_at: string | null;
  /** Ads only: lifetime counters that predate the daily rollup. */
  all_time_views: number | null;
  all_time_clicks: number | null;
  reach: number;
  /** Ads only (C47): the booked share, priority and daily cap. */
  sov_percent: number | null;
  priority: number | null;
  frequency_cap: number | null;
  /** The placement's ad-position displays on the days this creative ran. */
  slot_impressions: number;
};

export type BannerAnalyticsPlacement = BannerCounts & {
  placement: string;
  creatives: number;
  reach: number;
  slot_impressions: number;
};

/** The `admin_banner_analytics` payload, as GET /api/admin/banner-analytics returns it. */
export type BannerAnalytics = {
  from: string;
  to: string;
  /** First day anything was counted at all (null before the first event). */
  tracked_since: string | null;
  /** Creatives live right now under the same filters, whatever the range. */
  live_now: number;
  totals: BannerCounts & { reach: number };
  daily: (BannerCounts & { day: string })[];
  by_placement: BannerAnalyticsPlacement[];
  creatives: BannerAnalyticsCreative[];
};

export function isBannerEvent(value: unknown): value is BannerEvent {
  return (
    typeof value === "string" &&
    (BANNER_EVENTS as readonly string[]).includes(value)
  );
}

export function isBannerSource(value: unknown): value is BannerSource {
  return (
    typeof value === "string" &&
    (BANNER_SOURCES as readonly string[]).includes(value)
  );
}

export function isBannerBatchType(value: unknown): value is BannerBatchType {
  return (
    typeof value === "string" &&
    (BANNER_BATCH_TYPES as readonly string[]).includes(value)
  );
}

/** Clicks per 100 impressions (or views), one decimal; null when nothing was seen. */
export function ctrPercent(clicks: number, views: number): number | null {
  if (!Number.isFinite(views) || views <= 0) return null;
  return Math.round((clicks / views) * 1000) / 10;
}

/**
 * Actual share of voice (§6 "Planned vs Actual SOV"): this creative's
 * impressions out of every display of its placement's ad position while it
 * ran, one decimal; null before the slot was seen at all.
 */
export function actualSovPercent(
  impressions: number,
  slotImpressions: number,
): number | null {
  if (!Number.isFinite(slotImpressions) || slotImpressions <= 0) return null;
  return Math.min(
    100,
    Math.round((Math.max(0, impressions) / slotImpressions) * 1000) / 10,
  );
}
