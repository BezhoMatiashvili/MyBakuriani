import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  getServiceById,
  getServiceMetadataById,
} from "@/lib/data/getServiceById";
import EntertainmentDetailClient from "./EntertainmentDetailClient";

interface Props {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const data = await getServiceMetadataById(id);

  if (!data) {
    return { title: "გართობა ვერ მოიძებნა — MyBakuriani" };
  }

  return {
    title: `${data.title} — გართობა ბაკურიანში | MyBakuriani`,
    description: data.description ?? `${data.title} — გართობა ბაკურიანში`,
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
