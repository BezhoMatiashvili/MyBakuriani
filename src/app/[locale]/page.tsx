import { createPublicClient } from "@/lib/supabase/server";
import type { Tables } from "@/lib/types/database";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import LandingPage from "@/app/[locale]/_landing/LandingPage";
import { SkierLoader } from "@/components/shared/SkierLoader";

const LANDING_DATA_TIMEOUT_MS = 15_000;

const emptyLandingProps = {
  hotOffers: [] as Tables<"properties">[],
  hotels: [] as Tables<"properties">[],
  saleProperties: [] as Tables<"properties">[],
  services: [] as Tables<"services">[],
  blogPosts: [] as Tables<"blog_posts">[],
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
      { data: services },
      { data: blogPosts },
    ] = await Promise.race([queries, timeout]);

    return {
      hotOffers: hotOffers ?? [],
      hotels: hotels ?? [],
      saleProperties: saleProperties ?? [],
      services: services ?? [],
      blogPosts: blogPosts ?? [],
    };
  } catch {
    return emptyLandingProps;
  }
}

async function LandingWithData() {
  const props = await fetchLandingProps();
  return (
    <LandingPage
      hotOffers={props.hotOffers}
      hotels={props.hotels}
      saleProperties={props.saleProperties}
      services={props.services}
      blogPosts={props.blogPosts}
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
