import { createPublicClient } from "@/lib/supabase/server";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import LandingPage from "@/app/[locale]/_landing/LandingPage";
import { SkierLoader } from "@/components/shared/SkierLoader";
import { fetchSlotCreatives } from "@/lib/banner-slots-server";
import {
  getActiveZones,
  nearestZoneFrom,
  FALLBACK_ZONES,
  type Zone,
} from "@/lib/zones/server";
import {
  getStatusCards,
  DEFAULT_STATUS_CARDS,
} from "@/lib/status-cards/server";
import { getBakurianiWeather, withLiveWeather } from "@/lib/weather/server";
import { getRoadCondition, withLiveRoad } from "@/lib/road-condition/server";
import { withTimeout } from "@/lib/with-timeout";
import type { BannerCreative } from "@/lib/banner-creative";

const LANDING_DATA_TIMEOUT_MS = 15_000;
const LANDING_DEP_TIMEOUT_MS = 7_000;

export type PricePerSqmByZone = Record<string, number | null>;

export async function generateMetadata() {
  const t = await getTranslations("Metadata");
  return {
    title: t("siteTitle"),
    description: t("siteDescription"),
  };
}

export const revalidate = 120;

// Takes a promise so the landing queries fire in parallel with the zones
// fetch — zones are only needed for post-query aggregation below.
async function fetchLandingProps(zonesPromise: Promise<Zone[]>) {
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  ) {
    throw new Error(
      "[landing:configuration] Supabase public URL and anon key are required",
    );
  }

  const supabase = createPublicClient();

  const criticalQueries = withLandingTimeout(
    Promise.all([
      supabase
        .from("public_properties")
        .select("*")
        .eq("is_for_sale", false)
        .order("is_super_vip", { ascending: false })
        .order("is_vip", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(8),
      supabase
        .from("public_properties")
        .select("*")
        .eq("type", "hotel")
        .order("is_vip", { ascending: false })
        .limit(4),
      supabase
        .from("public_properties")
        .select("*")
        .eq("is_for_sale", true)
        .order("is_vip", { ascending: false })
        .limit(4),
      supabase
        .from("public_properties")
        .select("*")
        .eq("is_for_sale", false)
        .or("is_vip.eq.true,is_super_vip.eq.true")
        .order("price_per_night", { ascending: true, nullsFirst: false })
        .limit(12),
      supabase
        .from("public_services")
        .select("*")
        .order("is_vip", { ascending: false })
        .limit(20),
    ]),
    "critical_listings",
  );

  // Blog posts and the sale-price aggregate are optional. They start beside
  // the critical reads, but each owns its timeout/error fallback so neither
  // can turn successful property and service sections into empty arrays.
  const blogQuery = withLandingTimeout(
    supabase
      .from("blog_posts")
      .select("*")
      .eq("published", true)
      .order("published_at", { ascending: false })
      .limit(3),
    "blog_posts",
  ).catch((error: unknown) => {
    logOptionalLandingError("blog_posts", error);
    return null;
  });

  const aggregateQuery = withLandingTimeout(
    supabase
      .from("public_properties")
      .select("sale_price, area_sqm, location_lat, location_lng")
      .eq("is_for_sale", true)
      .not("sale_price", "is", null)
      .not("area_sqm", "is", null)
      .gt("area_sqm", 0)
      .not("location_lat", "is", null)
      .not("location_lng", "is", null),
    "sale_price_aggregate",
  ).catch((error: unknown) => {
    logOptionalLandingError("sale_price_aggregate", error);
    return null;
  });

  const [criticalResults, zones] = await Promise.all([
    criticalQueries,
    zonesPromise,
  ]);
  const [hotOffersResult, hotelsResult, saleResult, vipResult, servicesResult] =
    criticalResults;

  const hotOffers = requireLandingData("hot_offers", hotOffersResult);
  const hotels = requireLandingData("hotels", hotelsResult);
  const saleProperties = requireLandingData("sale_properties", saleResult);
  const vipProperties = requireLandingData("vip_properties", vipResult);
  const services = requireLandingData("services", servicesResult);

  const [blogResult, aggregateResult] = await Promise.all([
    blogQuery,
    aggregateQuery,
  ]);
  const blogPosts = optionalLandingData("blog_posts", blogResult);
  const saleAggregateRows = optionalLandingData(
    "sale_price_aggregate",
    aggregateResult,
  );

  return {
    hotOffers,
    hotels,
    saleProperties,
    vipProperties,
    services,
    blogPosts,
    pricePerSqmByZone: aggregateResult
      ? aggregatePricePerSqm(zones, saleAggregateRows)
      : emptyAggregate(zones),
  };
}

async function withLandingTimeout<T>(
  promise: PromiseLike<T>,
  label: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () =>
        reject(
          new Error(
            `[landing:${label}] timed out after ${LANDING_DATA_TIMEOUT_MS}ms`,
          ),
        ),
      LANDING_DATA_TIMEOUT_MS,
    );
  });

  try {
    return await Promise.race([Promise.resolve(promise), timeout]);
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.startsWith(`[landing:${label}]`)
    ) {
      throw error;
    }
    throw new Error(`[landing:${label}] query execution failed`, {
      cause: error,
    });
  } finally {
    clearTimeout(timer);
  }
}

type LandingQueryResult<T> = {
  data: T | null;
  error: { code?: string; message?: string } | null;
};

function landingQueryError(
  label: string,
  result: LandingQueryResult<unknown>,
) {
  if (result.error) {
    const code = result.error.code ? ` (${result.error.code})` : "";
    return new Error(
      `[landing:${label}] Supabase query failed${code}: ${result.error.message ?? "unknown error"}`,
    );
  }
  return new Error(
    `[landing:${label}] Supabase query returned no data without an error`,
  );
}

function requireLandingData<T>(
  label: string,
  result: LandingQueryResult<T>,
): T {
  if (result.error || result.data === null) {
    throw landingQueryError(label, result);
  }
  return result.data;
}

function optionalLandingData<T>(
  label: string,
  result: LandingQueryResult<T> | null,
): T | [] {
  if (!result) return [];
  if (result.error || result.data === null) {
    logOptionalLandingError(label, landingQueryError(label, result));
    return [];
  }
  return result.data;
}

function logOptionalLandingError(label: string, error: unknown) {
  console.error(`[landing:${label}] optional query unavailable`, error);
}

function emptyAggregate(zones: Zone[]): PricePerSqmByZone {
  return zones.reduce((acc, zone) => {
    acc[zone.name_ka] = zone.price_per_sqm_override ?? null;
    return acc;
  }, {} as PricePerSqmByZone);
}

function aggregatePricePerSqm(
  zones: Zone[],
  rows: Array<{
    sale_price: number | null;
    area_sqm: number | null;
    location_lat: number | null;
    location_lng: number | null;
  }>,
): PricePerSqmByZone {
  const sums: Record<string, number> = {};
  const counts: Record<string, number> = {};
  for (const zone of zones) {
    sums[zone.name_ka] = 0;
    counts[zone.name_ka] = 0;
  }

  for (const row of rows) {
    if (
      row.sale_price == null ||
      row.area_sqm == null ||
      row.area_sqm <= 0 ||
      row.location_lat == null ||
      row.location_lng == null
    ) {
      continue;
    }
    const zone = nearestZoneFrom(zones, row.location_lat, row.location_lng);
    if (!zone) continue;
    sums[zone.name_ka] += row.sale_price / row.area_sqm;
    counts[zone.name_ka] += 1;
  }

  return zones.reduce((acc, zone) => {
    // A manual override always wins over the computed listing average.
    acc[zone.name_ka] =
      zone.price_per_sqm_override ??
      (counts[zone.name_ka] > 0
        ? sums[zone.name_ka] / counts[zone.name_ka]
        : null);
    return acc;
  }, {} as PricePerSqmByZone);
}

async function LandingWithData() {
  // Non-listing dependencies remain time-bounded and degradable. Critical
  // property/service failures escape fetchLandingProps so ISR preserves the
  // last successful page instead of caching a blank refresh.
  const zonesPromise = withTimeout(
    getActiveZones(),
    LANDING_DEP_TIMEOUT_MS,
    FALLBACK_ZONES,
  );
  const [zones, props, bannerCreatives, statusCards, weather, road] =
    await Promise.all([
      zonesPromise,
      fetchLandingProps(zonesPromise),
      // One fetch covers every home placement. The landing page renders these
      // server-side (no flash, no layout shift above the fold); every other
      // surface gets them client-side from /api/banner-slots.
      withTimeout(
        fetchSlotCreatives(),
        LANDING_DEP_TIMEOUT_MS,
        [] as BannerCreative[],
      ),
      withTimeout(
        getStatusCards(),
        LANDING_DEP_TIMEOUT_MS,
        DEFAULT_STATUS_CARDS,
      ),
      withTimeout(getBakurianiWeather(), LANDING_DEP_TIMEOUT_MS, null),
      withTimeout(getRoadCondition(), LANDING_DEP_TIMEOUT_MS, null),
    ]);

  // Live weather / road status override their cards' value + detail; each falls
  // back to the DB/default value when its read failed, timed out, or is still
  // 'unknown' (road === null / weather === null).
  const statusCardsWithWeather = withLiveWeather(statusCards, weather);
  const statusCardsLive = withLiveRoad(statusCardsWithWeather, road);

  return (
    <LandingPage
      zones={zones}
      statusCards={statusCardsLive}
      hotOffers={props.hotOffers}
      hotels={props.hotels}
      saleProperties={props.saleProperties}
      vipProperties={props.vipProperties}
      services={props.services}
      blogPosts={props.blogPosts}
      bannerCreatives={bannerCreatives}
      pricePerSqmByZone={props.pricePerSqmByZone}
    />
  );
}

export default function Home() {
  return (
    <Suspense fallback={<SkierLoader />}>
      <LandingWithData />
    </Suspense>
  );
}
