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
import HotelDetailClient from "./HotelDetailClient";

interface Props {
  params: Promise<{ locale: AppLocale; id: string }>;
}

// Dynamic, not ISR: get(Property|Service)ById reads cookies() for the admin/owner
// pending-preview path, so this route cannot be statically cached (Next "static to dynamic").
export const dynamic = "force-dynamic";

// No build-time prerender — the empty list keeps the build free of any Supabase
// dependency; every request renders dynamically (force-dynamic above). dynamicParams=true.
export async function generateStaticParams() {
  return [];
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, id } = await params;
  const t = await getTranslations({ locale, namespace: "Metadata" });
  const data = await getPropertyMetadataById(id);

  if (!data) {
    return { title: t("detail.hotelNotFound") };
  }

  const title = t("detail.hotelTitle", { title: data.title });
  const description =
    data.description ??
    t("detail.hotelDesc", { title: data.title, location: data.location });

  return {
    title,
    description,
    ...buildListingMetadata({
      locale,
      title,
      description,
      images: data.photos ?? [],
      path: `/hotels/${id}`,
    }),
  };
}

export default async function HotelDetailPage({ params }: Props) {
  const { id } = await params;
  const { data: property, isMock } = await getPropertyById(id);

  if (!property) {
    notFound();
  }

  if (isMock) {
    return (
      <HotelDetailClient
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

  const isPending = property.status !== "active";

  return (
    <HotelDetailClient
      property={property}
      isPending={isPending}
      reviews={reviews ?? []}
      calendarBlocks={calendarBlocks ?? []}
      priceOverrides={(priceOverrides ?? []).map((o) => ({
        date: o.date,
        price: Number(o.price),
      }))}
    />
  );
}
