import { createPublicClient } from "@/lib/supabase/server";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import LandingPage from "@/app/[locale]/_landing/LandingPage";

export async function generateMetadata() {
  const t = await getTranslations("Metadata");
  return {
    title: t("siteTitle"),
    description: t("siteDescription"),
  };
}

export const revalidate = 120;

export default async function Home() {
  const supabase = createPublicClient();

  const [
    { data: hotOffers },
    { data: hotels },
    { data: saleProperties },
    { data: services },
    { data: blogPosts },
  ] = await Promise.all([
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

  return (
    <Suspense
      fallback={<div className="h-[60vh] animate-pulse bg-[#F8FAFC]" />}
    >
      <LandingPage
        hotOffers={hotOffers ?? []}
        hotels={hotels ?? []}
        saleProperties={saleProperties ?? []}
        services={services ?? []}
        blogPosts={blogPosts ?? []}
      />
    </Suspense>
  );
}
