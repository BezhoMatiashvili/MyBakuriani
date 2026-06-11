import { createPublicClient } from "@/lib/supabase/server";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import type { AppLocale } from "@/i18n/routing";
import EmploymentPageClient from "./EmploymentPageClient";

export const revalidate = 60;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: AppLocale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Metadata" });
  return {
    title: t("employment"),
    description: t("employmentDesc"),
  };
}

export default async function EmploymentPage() {
  const supabase = createPublicClient();

  const { data: services, error } = await supabase
    .from("services")
    .select("*")
    .eq("status", "active")
    .eq("category", "employment")
    .order("is_vip", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    console.error("[employment] failed to load services", error.message);
  }

  return <EmploymentPageClient services={services ?? []} />;
}
