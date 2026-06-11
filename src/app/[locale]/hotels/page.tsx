import { createPublicClient } from "@/lib/supabase/server";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import type { AppLocale } from "@/i18n/routing";
import HotelsPageClient from "./HotelsPageClient";

export const revalidate = 60;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: AppLocale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Metadata" });
  return {
    title: t("hotelsPage"),
    description: t("hotelsPageDesc"),
  };
}

export default async function HotelsPage() {
  const supabase = createPublicClient();

  const { data: properties, error } = await supabase
    .from("properties")
    .select("*")
    .eq("status", "active")
    .eq("is_for_sale", false)
    .eq("type", "hotel")
    .order("is_super_vip", { ascending: false })
    .order("is_vip", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    console.error("[hotels] failed to load properties", error.message);
  }

  return <HotelsPageClient properties={properties ?? []} />;
}
