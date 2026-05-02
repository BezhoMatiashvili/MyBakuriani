import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  getServiceById,
  getServiceMetadataById,
} from "@/lib/data/getServiceById";
import ServiceDetailClient from "./ServiceDetailClient";

interface Props {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const data = await getServiceMetadataById(id);

  if (!data) {
    return { title: "სერვისი ვერ მოიძებნა — MyBakuriani" };
  }

  return {
    title: `${data.title} — სერვისი ბაკურიანში | MyBakuriani`,
    description: data.description ?? `${data.title} — სერვისი ბაკურიანში`,
  };
}

export default async function ServiceDetailPage({ params }: Props) {
  const { id } = await params;
  const { data: service, isMock } = await getServiceById(id);

  if (!service) {
    notFound();
  }

  return <ServiceDetailClient service={service} isMock={isMock} />;
}
