import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  getServiceById,
  getServiceMetadataById,
} from "@/lib/data/getServiceById";
import FoodDetailClient from "./FoodDetailClient";

interface Props {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const data = await getServiceMetadataById(id);

  if (!data) {
    return { title: "კვება ვერ მოიძებნა — MyBakuriani" };
  }

  return {
    title: `${data.title} — კვება ბაკურიანში | MyBakuriani`,
    description: data.description ?? `${data.title} — კვება ბაკურიანში`,
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
