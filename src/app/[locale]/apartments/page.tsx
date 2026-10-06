import { createPublicClient } from "@/lib/supabase/server";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import type { AppLocale } from "@/i18n/routing";
import Breadcrumbs from "@/components/seo/Breadcrumbs";
import CategoryIntro from "@/components/seo/CategoryIntro";
import { buildPageMetadata } from "@/lib/seo";
import { getLiveStatusCards } from "@/lib/status-cards/live";
import { DETAIL_AUX_TIMEOUT_MS } from "@/lib/with-timeout";
import ApartmentsPageClient from "./ApartmentsPageClient";
import { firstPhotoOnly } from "@/lib/utils/photos";

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
  return buildPageMetadata({
    locale,
    path: "/apartments",
    title: t("apartmentsPage"),
    description: t("apartmentsPageDesc"),
  });
}

export default async function ApartmentsPage({
  params,
}: {
  params: Promise<{ locale: AppLocale }>;
}) {
  const { locale } = await params;
  const tNav = await getTranslations({ locale, namespace: "Navbar" });
  const supabase = createPublicClient();
  // Fetch status cards and listings in parallel instead of serially.
  const [statusCards, { data: properties, error }] = await Promise.all([
    getLiveStatusCards(DETAIL_AUX_TIMEOUT_MS),
    supabase
      .from("public_properties")
      // Only the columns the listing cards + map use (not all 57) — keeps the
      // prerendered RSC payload small. Keep in sync with ApartmentListing.
      .select(
        "id, title, location, photos, price_per_night, sale_price, is_for_sale, location_lat, location_lng, is_vip, is_super_vip, discount_percent, discount_expires_at, created_at, capacity, rooms, amenities, distance_to_slope_m, ownership_verified, type, hotel_stars, numeric_rating, room_type, is_b2b_partner",
      )
      .eq("is_for_sale", false)
      // Hotels too: "ბინები" is the one nav entry for both (owner's PDF
      // 2026-10-06). Hotel cards still open their own /hotels/<id> page.
      .in("type", ["apartment", "cottage", "villa", "studio", "hotel"])
      .order("is_super_vip", { ascending: false })
      .order("is_vip", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(100),
  ]);

  if (error) throw error;

  return (
    <>
      <Breadcrumbs
        locale={locale}
        items={[{ name: tNav("apartments"), path: "/apartments" }]}
      />
      <ApartmentsPageClient
        properties={(properties ?? []).map(firstPhotoOnly)}
        statusCards={statusCards}
      />
      {/* The index links /apartments/<id>; hotels are indexed from /hotels,
          where their canonical /hotels/<id> links live (C40). */}
      <CategoryIntro
        locale={locale}
        topic="apartments"
        listings={properties?.filter((p) => p.type !== "hotel")}
      />
    </>
  );
}
