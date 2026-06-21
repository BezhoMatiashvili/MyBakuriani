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
import SaleDetailClient from "./SaleDetailClient";

interface Props {
  params: Promise<{ locale: AppLocale; id: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, id } = await params;
  const t = await getTranslations({ locale, namespace: "Metadata" });
  const data = await getPropertyMetadataById(id);

  if (!data) {
    return { title: t("detail.saleNotFound") };
  }

  const title = t("detail.saleTitle", { title: data.title });
  const description =
    data.description ??
    t("detail.saleDesc", { title: data.title, location: data.location });

  return {
    title,
    description,
    ...buildListingMetadata({
      locale,
      title,
      description,
      images: data.photos ?? [],
      path: `/sales/${id}`,
    }),
  };
}

export default async function SaleDetailPage({ params }: Props) {
  const { id } = await params;
  const { data: property, isMock } = await getPropertyById(id);

  if (!property) {
    notFound();
  }

  if (isMock) {
    return <SaleDetailClient property={property} reviews={[]} />;
  }

  const supabase = createPublicClient();
  const { data: reviews } = await supabase
    .from("reviews")
    .select("*, profiles!reviews_guest_id_fkey(display_name)")
    .eq("property_id", id)
    .order("created_at", { ascending: false })
    .limit(20);

  return <SaleDetailClient property={property} reviews={reviews ?? []} />;
}
