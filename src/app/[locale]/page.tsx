import { createPublicClient } from "@/lib/supabase/server";
import type { Tables } from "@/lib/types/database";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import LandingPage from "@/app/[locale]/_landing/LandingPage";
import { SkierLoader } from "@/components/shared/SkierLoader";
import { fetchActiveBanners } from "@/lib/banners-server";
import {
  SEARCH_LOCATION_ZONES,
  nearestZone,
  type SearchLocationZone,
} from "@/lib/constants/locations";

const LANDING_DATA_TIMEOUT_MS = 15_000;

type PricePerSqmByZone = Record<SearchLocationZone, number | null>;

const emptyPricePerSqmByZone: PricePerSqmByZone = SEARCH_LOCATION_ZONES.reduce(
  (acc, zone) => {
    acc[zone] = null;
    return acc;
  },
  {} as PricePerSqmByZone,
);

const emptyLandingProps = {
  hotOffers: [] as Tables<"properties">[],
  hotels: [] as Tables<"properties">[],
  saleProperties: [] as Tables<"properties">[],
  vipProperties: [] as Tables<"properties">[],
  services: [] as Tables<"services">[],
  blogPosts: [] as Tables<"blog_posts">[],
  pricePerSqmByZone: emptyPricePerSqmByZone,
};

export async function generateMetadata() {
  const t = await getTranslations("Metadata");
  return {
    title: t("siteTitle"),
    description: t("siteDescription"),
  };
}

export const revalidate = 120;

async function fetchLandingProps() {
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  ) {
    return emptyLandingProps;
  }

  const supabase = createPublicClient();

  const queries = Promise.all([
    supabase
      .from("properties")
      .select("*")
      .eq("status", "active")
      .eq("is_for_sale", false)
      .order("is_super_vip", { ascending: false })
      .order("is_vip", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(8),
    supabase
      .from("properties")
      .select("*")
      .eq("status", "active")
      .eq("type", "hotel")
      .order("is_vip", { ascending: false })
      .limit(4),
    supabase
      .from("properties")
      .select("*")
      .eq("status", "active")
      .eq("is_for_sale", true)
      .order("is_vip", { ascending: false })
      .limit(4),
    supabase
      .from("properties")
      .select("*")
      .eq("status", "active")
      .eq("is_for_sale", false)
      .or("is_vip.eq.true,is_super_vip.eq.true")
      .order("price_per_night", { ascending: true, nullsFirst: false })
      .limit(12),
    supabase
      .from("services")
      .select("*")
      .eq("status", "active")
      .order("is_vip", { ascending: false })
      .limit(20),
    supabase
      .from("blog_posts")
      .select("*")
      .eq("published", true)
      .order("published_at", { ascending: false })
      .limit(3),
    supabase
      .from("properties")
      .select("sale_price, area_sqm, location_lat, location_lng")
      .eq("status", "active")
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
      { data: hotOffers },
      { data: hotels },
      { data: saleProperties },
      { data: vipProperties },
      { data: services },
      { data: blogPosts },
      { data: saleAggregateRows },
    ] = await Promise.race([queries, timeout]);

    return {
      hotOffers: hotOffers ?? [],
      hotels: hotels ?? [],
      saleProperties: saleProperties ?? [],
      vipProperties: vipProperties ?? [],
      services: services ?? [],
      blogPosts: blogPosts ?? [],
      pricePerSqmByZone: aggregatePricePerSqm(saleAggregateRows ?? []),
    };
  } catch {
    return emptyLandingProps;
  }
}

function aggregatePricePerSqm(
  rows: Array<{
    sale_price: number | null;
    area_sqm: number | null;
    location_lat: number | null;
    location_lng: number | null;
  }>,
): PricePerSqmByZone {
  const sums: Record<SearchLocationZone, number> = SEARCH_LOCATION_ZONES.reduce(
    (acc, zone) => {
      acc[zone] = 0;
      return acc;
    },
    {} as Record<SearchLocationZone, number>,
  );
  const counts: Record<SearchLocationZone, number> =
    SEARCH_LOCATION_ZONES.reduce(
      (acc, zone) => {
        acc[zone] = 0;
        return acc;
      },
      {} as Record<SearchLocationZone, number>,
    );

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
    const zone = nearestZone(row.location_lat, row.location_lng);
    sums[zone] += row.sale_price / row.area_sqm;
    counts[zone] += 1;
  }

  return SEARCH_LOCATION_ZONES.reduce((acc, zone) => {
    acc[zone] = counts[zone] > 0 ? sums[zone] / counts[zone] : null;
    return acc;
  }, {} as PricePerSqmByZone);
}

async function LandingWithData() {
  const [props, infoBanners, promoBanners] = await Promise.all([
    fetchLandingProps(),
    fetchActiveBanners("info").catch(() => []),
    fetchActiveBanners("promo").catch(() => []),
  ]);
  return (
    <LandingPage
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
