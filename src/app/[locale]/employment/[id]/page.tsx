import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  getServiceById,
  getServiceMetadataById,
} from "@/lib/data/getServiceById";
import { createPublicClient } from "@/lib/supabase/server";
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

  let applicationsCount = 0;
  if (isMock) {
    applicationsCount = 12;
  } else {
    try {
      const supabase = createPublicClient();
      const { count } = await supabase
        .from("job_applications")
        .select("*", { count: "exact", head: true })
        .eq("service_id", id);
      applicationsCount = count ?? 0;
    } catch {
      applicationsCount = 0;
    }
  }

  return (
    <EmploymentDetailClient
      service={service}
      isMock={isMock}
      applicationsCount={applicationsCount}
    />
  );
}
