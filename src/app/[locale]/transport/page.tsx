import { createPublicClient } from "@/lib/supabase/server";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import type { AppLocale } from "@/i18n/routing";
import TransportPageClient from "./TransportPageClient";

export const revalidate = 60;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: AppLocale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Metadata" });
  return {
    title: t("transport"),
    description: t("transportDesc"),
  };
}

export default async function TransportPage() {
  const supabase = createPublicClient();

  const { data: services, error } = await supabase
    .from("services")
    .select("*, owner:profiles!services_owner_id_fkey(is_verified)")
    .eq("status", "active")
    .eq("category", "transport")
    .order("is_vip", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    console.error("[transport] failed to load services", error.message);
  }

  return <TransportPageClient services={services ?? []} />;
}
