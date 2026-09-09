import type { Metadata } from "next";
import { notFound, unstable_rethrow } from "next/navigation";
import { getTranslations } from "next-intl/server";
import type { AppLocale } from "@/i18n/routing";
import {
  getServiceById,
  getServiceMetadataById,
} from "@/lib/data/getServiceById";
import { getCachedPublicService } from "@/lib/data/getCachedPublicListing";
import { buildListingMetadata } from "@/lib/seo";
import type { ServiceWithFoodExtras } from "@/lib/mock/services";
import ServiceDetailClient from "@/app/[locale]/services/[id]/ServiceDetailClient";

interface Props {
  params: Promise<{ locale: AppLocale; id: string }>;
}

// Owner/admin preview route: force-dynamic because get(Property|Service)ById
// reads cookies() to let a creator/admin view a pending listing. The public
// /services/[id] route is ISR and cookie-free; middleware rewrites ?preview=1
// requests (with an auth cookie) here so the browser URL stays the public one.
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, id } = await params;
  const t = await getTranslations({ locale, namespace: "Metadata" });
  const cached = await getCachedPublicService(id).catch(() => null);
  const data = cached
    ? {
        title: cached.title,
        description: cached.description,
        photos: cached.photos,
      }
    : await getServiceMetadataById(id);

  if (!data) {
    return { title: t("detail.serviceNotFound"), robots: { index: false } };
  }

  const title = t("detail.serviceTitle", { title: data.title });
  const description =
    data.description ?? t("detail.serviceDesc", { title: data.title });

  return {
    title,
    description,
    robots: { index: false },
    ...buildListingMetadata({
      locale,
      title,
      description,
      images: data.photos ?? [],
      path: `/services/${id}`,
    }),
  };
}

export default async function ServiceDetailPage({ params }: Props) {
  const { id } = await params;

  // Fast path: cached public (active) service — zero DB round-trip on a cache
  // hit. A transient miss-time error throws (not cached) so it falls through to
  // the dynamic path instead of being served as not-found.
  let cached: ServiceWithFoodExtras | null = null;
  try {
    cached = await getCachedPublicService(id);
  } catch (err) {
    unstable_rethrow(err);
    cached = null;
  }

  if (cached) {
    return (
      <ServiceDetailClient service={cached} isMock={false} isPending={false} />
    );
  }

  // Dynamic fallback: pending/blocked/missing, or owner/admin preview.
  const { data: service, isMock } = await getServiceById(id);

  if (!service) {
    notFound();
  }

  const isPending = !isMock && service.status !== "active";

  return (
    <ServiceDetailClient
      service={service}
      isMock={isMock}
      isPending={isPending}
    />
  );
}
