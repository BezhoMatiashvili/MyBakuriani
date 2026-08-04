import { createPublicClient } from "@/lib/supabase/server";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import type { AppLocale } from "@/i18n/routing";
import FoodPageClient from "./FoodPageClient";

export const revalidate = 60;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: AppLocale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Metadata" });
  return {
    title: t("food"),
    description: t("foodDesc"),
  };
}

export default async function FoodPage() {
  const supabase = createPublicClient();

  const { data: services, error } = await supabase
    .from("public_services")
    .select("*")
    .eq("category", "food")
    .order("has_active_discount", { ascending: false })
    .order("is_vip", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) throw error;

  return <FoodPageClient services={services ?? []} />;
}
