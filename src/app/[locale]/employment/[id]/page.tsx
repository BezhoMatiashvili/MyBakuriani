import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import type { AppLocale } from "@/i18n/routing";
import {
  getServiceById,
  getServiceMetadataById,
} from "@/lib/data/getServiceById";
import { buildListingMetadata } from "@/lib/seo";
import { createPublicClient } from "@/lib/supabase/server";
import EmploymentDetailClient from "./EmploymentDetailClient";

interface Props {
  params: Promise<{ locale: AppLocale; id: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, id } = await params;
  const t = await getTranslations({ locale, namespace: "Metadata" });
  const data = await getServiceMetadataById(id);

  if (!data) {
    return { title: t("detail.employmentNotFound") };
  }

  const title = t("detail.employmentTitle", { title: data.title });
  const description =
    data.description ?? t("detail.employmentDesc", { title: data.title });

  return {
    title,
    description,
    ...buildListingMetadata({
      locale,
      title,
      description,
      images: data.photos ?? [],
      path: `/employment/${id}`,
    }),
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
