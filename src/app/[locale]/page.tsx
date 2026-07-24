import { createPublicClient } from "@/lib/supabase/server";
import type { Tables } from "@/lib/types/database";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import LandingPage from "@/app/[locale]/_landing/LandingPage";
import { SkierLoader } from "@/components/shared/SkierLoader";
import { fetchActiveBanners } from "@/lib/banners-server";
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
import { withTimeout } from "@/lib/with-timeout";
import type { LandingBanner } from "@/lib/banners";

const LANDING_DATA_TIMEOUT_MS = 15_000;
const LANDING_DEP_TIMEOUT_MS = 7_000;

export type PricePerSqmByZone = Record<string, number | null>;

const emptyLandingProps = {
  hotOffers: [] as Tables<"properties">[],
  hotels: [] as Tables<"properties">[],
  saleProperties: [] as Tables<"properties">[],
  vipProperties: [] as Tables<"properties">[],
  services: [] as Tables<"services">[],
  blogPosts: [] as Tables<"blog_posts">[],
  pricePerSqmByZone: {} as PricePerSqmByZone,
};

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
    const zones = await zonesPromise;
    return { ...emptyLandingProps, pricePerSqmByZone: emptyAggregate(zones) };
  }

  const supabase = createPublicClient();

  const queries = Promise.all([
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
    supabase
      .from("blog_posts")
      .select("*")
      .eq("published", true)
      .order("published_at", { ascending: false })
      .limit(3),
    supabase
      .from("public_properties")
      .select("sale_price, area_sqm, location_lat, location_lng")
      .eq("is_for_sale", true)
      .not("sale_price", "is", null)
      .not("area_sqm", "is", null)
      .gt("area_sqm", 0)
      .not("location_lat", "is", null)
      .not("location_lng", "is", null),
  ]);

  const timeout = new Promise<never>((_, reject) => {
    setTimeout(
      () => reject(new Error("landing Supabase fetch timeout")),
      LANDING_DATA_TIMEOUT_MS,
    );
  });

  try {
    const [
      [
        { data: hotOffers },
        { data: hotels },
        { data: saleProperties },
        { data: vipProperties },
        { data: services },
        { data: blogPosts },
        { data: saleAggregateRows },
      ],
      zones,
    ] = await Promise.race([Promise.all([queries, zonesPromise]), timeout]);

    return {
      hotOffers: hotOffers ?? [],
      hotels: hotels ?? [],
      saleProperties: saleProperties ?? [],
      vipProperties: vipProperties ?? [],
      services: services ?? [],
      blogPosts: blogPosts ?? [],
      pricePerSqmByZone: aggregatePricePerSqm(zones, saleAggregateRows ?? []),
    };
  } catch {
    const zones = await zonesPromise;
    return { ...emptyLandingProps, pricePerSqmByZone: emptyAggregate(zones) };
  }
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
  // Every dependency is time-bounded with a fallback so a slow/hung Supabase
  // read degrades to partial content instead of freezing the page on its
  // loading fallback forever (the client-level fetch timeouts are the backstop).
  const zonesPromise = withTimeout(
    getActiveZones(),
    LANDING_DEP_TIMEOUT_MS,
    FALLBACK_ZONES,
  );
  const [zones, props, infoBanners, promoBanners, statusCards, weather] =
    await Promise.all([
      zonesPromise,
      fetchLandingProps(zonesPromise),
      withTimeout(
        fetchActiveBanners("info"),
        LANDING_DEP_TIMEOUT_MS,
        [] as LandingBanner[],
      ),
      withTimeout(
        fetchActiveBanners("promo"),
        LANDING_DEP_TIMEOUT_MS,
        [] as LandingBanner[],
      ),
      withTimeout(
        getStatusCards(),
        LANDING_DEP_TIMEOUT_MS,
        DEFAULT_STATUS_CARDS,
      ),
      withTimeout(getBakurianiWeather(), LANDING_DEP_TIMEOUT_MS, null),
    ]);

  // Live weather always overrides the weather card's value/icon; falls back to
  // the DB/default value when the fetch failed or timed out (weather === null).
  const statusCardsWithWeather = withLiveWeather(statusCards, weather);

  return (
    <LandingPage
      zones={zones}
      statusCards={statusCardsWithWeather}
      hotOffers={props.hotOffers}
      hotels={props.hotels}
      saleProperties={props.saleProperties}
      vipProperties={props.vipProperties}
      services={props.services}
      blogPosts={props.blogPosts}
      infoBanners={infoBanners}
      promoBanners={promoBanners}
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
