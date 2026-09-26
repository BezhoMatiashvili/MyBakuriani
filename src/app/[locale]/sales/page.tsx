import { createPublicClient } from "@/lib/supabase/server";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import type { AppLocale } from "@/i18n/routing";
import SalesPageClient from "./SalesPageClient";

// Public listing data changes rarely; serve from the ISR cache instead of a
// per-request DB round-trip. createPublicClient reads no cookies, so the page
// is statically cacheable (the cookie-bound client forced dynamic rendering).
export const revalidate = 60;

// Fetch window for the flat, unpaginated query below. Well above any realistic
// active-sale-listing count today (15) so the client's full filter/sort/
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
    title: t("salesPage"),
    description: t("salesPageDesc"),
  };
}

export default async function SalesPage() {
  const supabase = createPublicClient();

  const {
    data: properties,
    error,
    count,
  } = await supabase
    .from("public_properties")
    // Only the columns the sale cards + filters use — keeps the prerendered
    // RSC payload small. Keep in sync with SaleListing.
    .select(
      "id, title, location, photos, sale_price, type, area_sqm, roi_percent, construction_status, amenities, house_rules, discount_percent, discount_expires_at, is_vip, is_super_vip, created_at",
      { count: "exact" },
    )
    .eq("is_for_sale", true)
    .order("is_super_vip", { ascending: false })
    .order("is_vip", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(MAX_LISTINGS);

  if (error) throw error;

  if ((count ?? 0) > (properties?.length ?? 0)) {
    console.warn(
      `[sales] fetched ${properties?.length ?? 0} of ${count} active listings; rows beyond the ${MAX_LISTINGS}-row window are unreachable`,
    );
  }

  return <SalesPageClient properties={properties ?? []} />;
}
