import { createPublicClient } from "@/lib/supabase/server";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import type { AppLocale } from "@/i18n/routing";
import SalesPageClient from "./SalesPageClient";

// Public listing data changes rarely; serve from the ISR cache instead of a
// per-request DB round-trip. createPublicClient reads no cookies, so the page
// is statically cacheable (the cookie-bound client forced dynamic rendering).
export const revalidate = 60;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: AppLocale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Metadata" });
  return {
    title: t("salesPage"),
    description: t("salesPageDesc"),
  };
}

export default async function SalesPage() {
  const supabase = createPublicClient();

  const { data: properties, error } = await supabase
    .from("public_properties")
    .select("*")
    .eq("is_for_sale", true)
    .order("is_super_vip", { ascending: false })
    .order("is_vip", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) throw error;

  return <SalesPageClient properties={properties ?? []} />;
}
