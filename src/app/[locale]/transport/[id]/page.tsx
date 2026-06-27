import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import type { AppLocale } from "@/i18n/routing";
import {
  getServiceById,
  getServiceMetadataById,
} from "@/lib/data/getServiceById";
import { buildListingMetadata } from "@/lib/seo";
import TransportDetailClient from "./TransportDetailClient";

interface Props {
  params: Promise<{ locale: AppLocale; id: string }>;
}

// Dynamic, not ISR: get(Property|Service)ById reads cookies() for the admin/owner
// pending-preview path, so this route cannot be statically cached (Next "static to dynamic").
export const dynamic = "force-dynamic";

// No build-time prerender — the empty list keeps the build free of any Supabase
// dependency; every request renders dynamically (force-dynamic above). dynamicParams=true.
export async function generateStaticParams() {
  return [];
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, id } = await params;
  const t = await getTranslations({ locale, namespace: "Metadata" });
  const data = await getServiceMetadataById(id);

  if (!data) {
    return { title: t("detail.transportNotFound") };
  }

  const title = t("detail.transportTitle", { title: data.title });
  const description =
    data.description ?? t("detail.transportDesc", { title: data.title });

  return {
    title,
    description,
    ...buildListingMetadata({
      locale,
      title,
      description,
      images: data.photos ?? [],
      path: `/transport/${id}`,
    }),
  };
}

export default async function TransportDetailPage({ params }: Props) {
  const { id } = await params;
  const { data: service, isMock } = await getServiceById(id);

  if (!service) {
    notFound();
  }

  const isPending = !isMock && service.status !== "active";

  return (
    <TransportDetailClient
      service={service}
      isMock={isMock}
      isPending={isPending}
    />
  );
}
