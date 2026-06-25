import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import type { AppLocale } from "@/i18n/routing";
import {
  getServiceById,
  getServiceMetadataById,
} from "@/lib/data/getServiceById";
import { buildListingMetadata } from "@/lib/seo";
import EntertainmentDetailClient from "./EntertainmentDetailClient";

interface Props {
  params: Promise<{ locale: AppLocale; id: string }>;
}

export const revalidate = 120;

// ISR: rendered on first request, then cached/revalidated. No build-time
// Supabase prerender (dynamicParams defaults to true).
export async function generateStaticParams() {
  return [];
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, id } = await params;
  const t = await getTranslations({ locale, namespace: "Metadata" });
  const data = await getServiceMetadataById(id);

  if (!data) {
    return { title: t("detail.entertainmentNotFound") };
  }

  const title = t("detail.entertainmentTitle", { title: data.title });
  const description =
    data.description ?? t("detail.entertainmentDesc", { title: data.title });

  return {
    title,
    description,
    ...buildListingMetadata({
      locale,
      title,
      description,
      images: data.photos ?? [],
      path: `/entertainment/${id}`,
    }),
  };
}

export default async function EntertainmentDetailPage({ params }: Props) {
  const { id } = await params;
  const { data: service, isMock } = await getServiceById(id);

  if (!service) {
    notFound();
  }

  return <EntertainmentDetailClient service={service} isMock={isMock} />;
}
