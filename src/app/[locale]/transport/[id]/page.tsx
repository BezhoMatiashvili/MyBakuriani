import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  getServiceById,
  getServiceMetadataById,
} from "@/lib/data/getServiceById";
import TransportDetailClient from "./TransportDetailClient";

interface Props {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const data = await getServiceMetadataById(id);

  if (!data) {
    return { title: "ტრანსპორტი ვერ მოიძებნა — MyBakuriani" };
  }

  return {
    title: `${data.title} — ტრანსპორტი ბაკურიანში | MyBakuriani`,
    description: data.description ?? `${data.title} — ტრანსპორტი ბაკურიანში`,
  };
}

export default async function TransportDetailPage({ params }: Props) {
  const { id } = await params;
  const { data: service, isMock } = await getServiceById(id);

  if (!service) {
    notFound();
  }

  return <TransportDetailClient service={service} isMock={isMock} />;
}
