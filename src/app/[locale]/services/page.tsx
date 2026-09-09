import { createPublicClient } from "@/lib/supabase/server";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import type { AppLocale } from "@/i18n/routing";
import ServicesPageClient from "./ServicesPageClient";

export const revalidate = 60;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: AppLocale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Metadata" });
  return {
    title: t("services"),
    description: t("servicesDesc"),
  };
}

export default async function ServicesPage() {
  const supabase = createPublicClient();

  const { data: services, error } = await supabase
    .from("public_services")
    // Only the columns the service cards + filters use — keeps the prerendered
    // RSC payload small. Keep in sync with PublicService in ServicesPageClient.
    .select(
      "id, title, category, position, location, photos, price, price_unit, discount_percent, discount_expires_at, schedule, operating_hours, is_vip, has_whatsapp, created_at",
    )
    .in("category", ["handyman", "cleaning"])
    .order("is_vip", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) throw error;

  return <ServicesPageClient services={services ?? []} />;
}
