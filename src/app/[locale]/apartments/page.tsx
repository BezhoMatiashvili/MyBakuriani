import { createPublicClient } from "@/lib/supabase/server";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import type { AppLocale } from "@/i18n/routing";
import { getStatusCards } from "@/lib/status-cards/server";
import ApartmentsPageClient from "./ApartmentsPageClient";

// Cache the public (active) listings instead of paying an Auth round-trip +
// fresh query on every visit. Owners review their own pending listings from the
// dashboard, which lists every property they own regardless of status.
export const revalidate = 60;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: AppLocale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Metadata" });
  return {
    title: t("apartmentsPage"),
    description: t("apartmentsPageDesc"),
  };
}

export default async function ApartmentsPage() {
  const supabase = createPublicClient();
  const statusCards = await getStatusCards();

  const { data: properties, error } = await supabase
    .from("properties")
    .select("*")
    .eq("is_for_sale", false)
    .in("type", ["apartment", "cottage", "villa", "studio"])
    .eq("status", "active")
    .order("is_super_vip", { ascending: false })
    .order("is_vip", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    console.error("[apartments] failed to load properties", error.message);
  }

  return (
    <ApartmentsPageClient
      properties={properties ?? []}
      statusCards={statusCards}
    />
  );
}
