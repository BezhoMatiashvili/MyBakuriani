import { createPublicClient } from "@/lib/supabase/server";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import type { AppLocale } from "@/i18n/routing";
import FoodPageClient from "./FoodPageClient";

export const revalidate = 60;

// Fetch window for the flat, unpaginated query below. Well above any realistic
// active-food-listing count today (6) so the client's full filter/sort/
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
    title: t("food"),
    description: t("foodDesc"),
  };
}

export default async function FoodPage() {
  const supabase = createPublicClient();

  const {
    data: services,
    error,
    count,
  } = await supabase
    .from("public_services")
    // Only the columns the food cards + filters use — keeps the prerendered
    // RSC payload small. Keep in sync with PublicService in FoodPageClient.
    .select(
      "id, title, category, location, photos, price, price_unit, cuisine_type, schedule, operating_hours, is_vip, created_at, best_active_menu_item_discount_percent",
      { count: "exact" },
    )
    .eq("category", "food")
    .order("has_active_discount", { ascending: false })
    .order("is_vip", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(MAX_LISTINGS);

  if (error) throw error;

  if ((count ?? 0) > (services?.length ?? 0)) {
    console.warn(
      `[food] fetched ${services?.length ?? 0} of ${count} active listings; rows beyond the ${MAX_LISTINGS}-row window are unreachable`,
    );
  }

  return <FoodPageClient services={services ?? []} />;
}
