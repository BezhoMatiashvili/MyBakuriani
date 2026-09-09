import { createPublicClient } from "@/lib/supabase/server";
import { getCvCountsForServices } from "@/lib/data/getCachedPublicListing";
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
    .from("public_services")
    // Only the columns the vacancy cards + filters use — keeps the prerendered
    // RSC payload small. Keep in sync with EmploymentListing.
    .select(
      "id, title, position, location, description, price, price_unit, salary_daily, salary_min, salary_max, work_schedule, employment_schedule, employment_type, discount_percent, discount_expires_at, is_vip, created_at",
    )
    .eq("category", "employment")
    .order("is_vip", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) throw error;

  const cvCounts = await getCvCountsForServices(
    (services ?? []).map((s) => s.id),
  );

  return <EmploymentPageClient services={services ?? []} cvCounts={cvCounts} />;
}
