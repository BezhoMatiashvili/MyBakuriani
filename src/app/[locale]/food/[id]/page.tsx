import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import type { AppLocale } from "@/i18n/routing";
import {
  getServiceById,
  getServiceMetadataById,
} from "@/lib/data/getServiceById";
import FoodDetailClient from "./FoodDetailClient";

interface Props {
  params: Promise<{ locale: AppLocale; id: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, id } = await params;
  const t = await getTranslations({ locale, namespace: "Metadata" });
  const data = await getServiceMetadataById(id);

  if (!data) {
    return { title: t("detail.foodNotFound") };
  }

  return {
    title: t("detail.foodTitle", { title: data.title }),
    description:
      data.description ?? t("detail.foodDesc", { title: data.title }),
  };
}

export default async function FoodDetailPage({ params }: Props) {
  const { id } = await params;
  const { data: service, isMock } = await getServiceById(id);

  if (!service) {
    notFound();
  }

  return <FoodDetailClient service={service} isMock={isMock} />;
}
