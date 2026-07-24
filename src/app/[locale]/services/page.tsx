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
    .select("*")
    .in("category", ["handyman", "cleaning"])
    .order("is_vip", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) throw error;

  return <ServicesPageClient services={services ?? []} />;
}
