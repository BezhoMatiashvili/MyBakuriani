import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import type { AppLocale } from "@/i18n/routing";
import { createPublicClient } from "@/lib/supabase/server";
import {
  getPropertyById,
  getPropertyMetadataById,
} from "@/lib/data/getPropertyById";
import { buildListingMetadata } from "@/lib/seo";
import ApartmentDetailClient from "./ApartmentDetailClient";

interface Props {
  params: Promise<{ locale: AppLocale; id: string }>;
}

export const revalidate = 120;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, id } = await params;
  const t = await getTranslations({ locale, namespace: "Metadata" });
  const data = await getPropertyMetadataById(id);

  if (!data) {
    return { title: t("detail.apartmentNotFound") };
  }

  const title = t("detail.apartmentTitle", { title: data.title });
  const description =
    data.description ??
    t("detail.apartmentDesc", {
      title: data.title,
      location: data.location,
    });

  return {
    title,
    description,
    ...buildListingMetadata({
      locale,
      title,
      description,
      images: data.photos ?? [],
      path: `/apartments/${id}`,
    }),
  };
}

export default async function ApartmentDetailPage({ params }: Props) {
  const { id } = await params;
  const { data: property, isMock } = await getPropertyById(id);

  if (!property) {
    notFound();
  }

  if (isMock) {
    return (
      <ApartmentDetailClient
        property={property}
        reviews={[]}
        calendarBlocks={[]}
        priceOverrides={[]}
      />
    );
  }

  const supabase = createPublicClient();
  const today = new Date();
  const threeMonthsLater = new Date(today);
  threeMonthsLater.setMonth(threeMonthsLater.getMonth() + 3);
  const todayStr = today.toISOString().split("T")[0];
  const horizonStr = threeMonthsLater.toISOString().split("T")[0];

  const [
    { data: reviews },
    { data: calendarBlocks },
    { data: priceOverrides },
  ] = await Promise.all([
    supabase
      .from("reviews")
      .select("*, profiles!reviews_guest_id_fkey(display_name)")
      .eq("property_id", id)
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("calendar_blocks")
      .select("date, status")
      .eq("property_id", id)
      .gte("date", todayStr)
      .lte("date", horizonStr),
    supabase
      .from("price_overrides")
      .select("date, price")
      .eq("property_id", id)
      .gte("date", todayStr)
      .lte("date", horizonStr),
  ]);

  return (
    <ApartmentDetailClient
      property={property}
      reviews={reviews ?? []}
      calendarBlocks={calendarBlocks ?? []}
      priceOverrides={(priceOverrides ?? []).map((o) => ({
        date: o.date,
        price: Number(o.price),
      }))}
    />
  );
}
