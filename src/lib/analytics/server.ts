import "server-only";
import type { BannerAnalytics } from "@/lib/banner-analytics";
import {
  LIVE_WINDOW_MINUTES,
  previousRange,
  type AnalyticsQuery,
  type DataBlock,
  type DateRange,
  type Dimensions,
  type Granularity,
} from "@/lib/analytics/model";
import type {
  AdsData,
  BlockPayload,
  ListingsData,
  LiveData,
  SmartMatchData,
  TrafficData,
} from "@/lib/analytics/report";
import type { createServiceClient } from "@/lib/supabase/admin";

type Db = ReturnType<typeof createServiceClient>;

export type BlockData = {
  traffic: TrafficData;
  listings: ListingsData;
  smartmatch: SmartMatchData;
  ads: AdsData;
  live: LiveData;
};

// Every number comes from one SQL definition (C26, C49): these only call the
// functions and pass the dashboard's period and filters through.

function dimensionArgs(dims: Dimensions) {
  return {
    p_device: dims.device ?? undefined,
    p_country: dims.country ?? undefined,
    p_city: dims.city ?? undefined,
    p_source: dims.source ?? undefined,
    p_page_type: dims.page ?? undefined,
  };
}

function unwrap<T>(
  name: string,
  result: { data: unknown; error: { code?: string; message?: string } | null },
): T {
  if (result.error || result.data === null || result.data === undefined) {
    throw new Error(
      `${name} failed: ${result.error?.code ?? "no data"} ${result.error?.message ?? ""}`.trim(),
    );
  }
  return result.data as T;
}

async function loadTraffic(
  db: Db,
  range: DateRange,
  granularity: Granularity,
  dims: Dimensions,
): Promise<TrafficData> {
  return unwrap<TrafficData>(
    "admin_analytics_traffic",
    await db.rpc("admin_analytics_traffic", {
      p_from: range.from,
      p_to: range.to,
      p_granularity: granularity,
      ...dimensionArgs(dims),
    }),
  );
}

async function loadListings(
  db: Db,
  range: DateRange,
  dims: Dimensions,
): Promise<ListingsData> {
  return unwrap<ListingsData>(
    "admin_analytics_listings",
    await db.rpc("admin_analytics_listings", {
      p_from: range.from,
      p_to: range.to,
      ...dimensionArgs(dims),
    }),
  );
}

async function loadSmartMatch(
  db: Db,
  range: DateRange,
  dims: Dimensions,
): Promise<SmartMatchData> {
  return unwrap<SmartMatchData>(
    "admin_analytics_smart_match",
    await db.rpc("admin_analytics_smart_match", {
      p_from: range.from,
      p_to: range.to,
      ...dimensionArgs(dims),
    }),
  );
}

// Ads follow the period only: their counters hold no visitor data (C46).
// Impressions, reach and clicks are the media plan's report (C47); live ads,
// advertisers and revenue come from admin_analytics_ads.
async function loadAds(db: Db, range: DateRange): Promise<AdsData> {
  const [banners, summary] = await Promise.all([
    db
      .rpc("admin_banner_analytics", {
        p_from: range.from,
        p_to: range.to,
        p_source: "ad",
      })
      .then((r) => unwrap<BannerAnalytics>("admin_banner_analytics", r)),
    db
      .rpc("admin_analytics_ads", { p_from: range.from, p_to: range.to })
      .then((r) =>
        unwrap<
          Pick<
            AdsData,
            | "active_ads"
            | "active_advertisers"
            | "ads_without_advertiser"
            | "revenue"
          >
        >("admin_analytics_ads", r),
      ),
  ]);
  return {
    active_ads: summary.active_ads,
    active_advertisers: summary.active_advertisers,
    ads_without_advertiser: summary.ads_without_advertiser,
    revenue: Number(summary.revenue ?? 0),
    totals: {
      impressions: banners.totals.impressions,
      reach: banners.totals.reach,
      clicks: banners.totals.clicks,
      views: banners.totals.views,
      opens: banners.totals.opens,
    },
    by_placement: banners.by_placement.map((p) => ({
      placement: p.placement,
      creatives: p.creatives,
      impressions: p.impressions,
      reach: p.reach,
      clicks: p.clicks,
      views: p.views,
      opens: p.opens,
    })),
    tracked_since: banners.tracked_since,
  };
}

async function loadLive(db: Db, dims: Dimensions): Promise<LiveData> {
  return unwrap<LiveData>(
    "admin_analytics_live",
    await db.rpc("admin_analytics_live", {
      ...dimensionArgs(dims),
      p_minutes: LIVE_WINDOW_MINUTES,
    }),
  );
}

function loadOne<B extends DataBlock>(
  db: Db,
  block: B,
  query: AnalyticsQuery,
  range: DateRange,
): Promise<BlockData[B]> {
  switch (block) {
    case "traffic":
      return loadTraffic(db, range, query.granularity, query.dims) as Promise<
        BlockData[B]
      >;
    case "listings":
      return loadListings(db, range, query.dims) as Promise<BlockData[B]>;
    case "smartmatch":
      return loadSmartMatch(db, range, query.dims) as Promise<BlockData[B]>;
    case "ads":
      return loadAds(db, range) as Promise<BlockData[B]>;
    default:
      return loadLive(db, query.dims) as Promise<BlockData[B]>;
  }
}

/**
 * One dashboard block for the query's period, and for the preceding period of
 * the same length when "compare" is on (Live Now has no period).
 */
export async function loadAnalyticsBlock<B extends DataBlock>(
  db: Db,
  block: B,
  query: AnalyticsQuery,
): Promise<BlockPayload<BlockData[B]>> {
  const prior =
    query.compare && block !== "live" ? previousRange(query.range) : null;
  const [current, previous] = await Promise.all([
    loadOne(db, block, query, query.range),
    prior ? loadOne(db, block, query, prior) : Promise.resolve(null),
  ]);
  return { current, previous, previousRange: prior };
}
