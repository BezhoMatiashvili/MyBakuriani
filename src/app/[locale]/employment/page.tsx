import { createPublicClient } from "@/lib/supabase/server";
import { getCvCountsForServices } from "@/lib/data/getCachedPublicListing";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import type { AppLocale } from "@/i18n/routing";
import EmploymentPageClient from "./EmploymentPageClient";

export const revalidate = 60;

// Fetch window for the flat, unpaginated query below. Well above any realistic
// active-employment-listing count today (6) so the client's full filter/sort/
// paginate pipeline sees the whole catalog, not a truncated slice.
const MAX_LISTINGS = 1000;

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

  const {
    data: services,
    error,
    count,
  } = await supabase
    .from("public_services")
    // Only the columns the vacancy cards + filters use — keeps the prerendered
    // RSC payload small. Keep in sync with EmploymentListing.
    .select(
      "id, title, position, location, description, price, price_unit, salary_daily, salary_min, salary_max, work_schedule, employment_schedule, employment_type, discount_percent, discount_expires_at, is_vip, is_super_vip, created_at",
      { count: "exact" },
    )
    .eq("category", "employment")
    .order("is_super_vip", { ascending: false })
    .order("is_vip", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(MAX_LISTINGS);

  if (error) throw error;

  if ((count ?? 0) > (services?.length ?? 0)) {
    console.warn(
      `[employment] fetched ${services?.length ?? 0} of ${count} active listings; rows beyond the ${MAX_LISTINGS}-row window are unreachable`,
    );
  }

  const cvCounts = await getCvCountsForServices(
    (services ?? []).map((s) => s.id),
  );

  return <EmploymentPageClient services={services ?? []} cvCounts={cvCounts} />;
}
