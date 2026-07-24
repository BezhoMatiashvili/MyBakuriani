import { createPublicClient } from "@/lib/supabase/server";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import type { AppLocale } from "@/i18n/routing";
import { getStatusCards } from "@/lib/status-cards/server";
import HotelsPageClient from "./HotelsPageClient";

export const revalidate = 60;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: AppLocale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Metadata" });
  return {
    title: t("hotelsPage"),
    description: t("hotelsPageDesc"),
  };
}

export default async function HotelsPage() {
  const supabase = createPublicClient();
  // Fetch status cards and listings in parallel instead of serially.
  const [statusCards, { data: properties, error }] = await Promise.all([
    getStatusCards(),
    supabase
      .from("public_properties")
      // Only the columns the hotel cards + map use (not all 57). Keep in sync
      // with HotelListing in HotelsPageClient.
      .select(
        "id, title, location, photos, price_per_night, sale_price, is_for_sale, location_lat, location_lng, is_vip, is_super_vip, discount_percent, discount_expires_at, capacity, rooms, amenities, hotel_stars, numeric_rating, room_type, is_b2b_partner",
      )
      .eq("is_for_sale", false)
      .eq("type", "hotel")
      .order("is_super_vip", { ascending: false })
      .order("is_vip", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(100),
  ]);

  if (error) throw error;

  return (
    <HotelsPageClient properties={properties ?? []} statusCards={statusCards} />
  );
}
