import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  getServiceById,
  getServiceMetadataById,
} from "@/lib/data/getServiceById";
import EmploymentDetailClient from "./EmploymentDetailClient";

interface Props {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const data = await getServiceMetadataById(id);

  if (!data) {
    return { title: "ვაკანსია ვერ მოიძებნა — MyBakuriani" };
  }

  return {
    title: `${data.title} — ვაკანსია ბაკურიანში | MyBakuriani`,
    description: data.description ?? `${data.title} — ვაკანსია ბაკურიანში`,
  };
}

export default async function EmploymentDetailPage({ params }: Props) {
  const { id } = await params;
  const { data: service, isMock } = await getServiceById(id);

  if (!service) {
    notFound();
  }

  return <EmploymentDetailClient service={service} isMock={isMock} />;
}
