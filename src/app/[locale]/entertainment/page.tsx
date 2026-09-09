import { createPublicClient } from "@/lib/supabase/server";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import type { AppLocale } from "@/i18n/routing";
import EntertainmentPageClient from "./EntertainmentPageClient";

export const revalidate = 60;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: AppLocale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Metadata" });
  return {
    title: t("entertainment"),
    description: t("entertainmentDesc"),
  };
}

export default async function EntertainmentPage() {
  const supabase = createPublicClient();

  const { data: services, error } = await supabase
    .from("public_services")
    // Only the columns the cards + filters use — keeps the prerendered RSC
    // payload small. Keep in sync with PublicService in EntertainmentPageClient.
    .select(
      "id, title, category, activity_category, location, photos, price, price_unit, discount_percent, discount_expires_at, is_vip, has_whatsapp, created_at",
    )
    .eq("category", "entertainment")
    .order("is_vip", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) throw error;

  return <EntertainmentPageClient services={services ?? []} />;
}
