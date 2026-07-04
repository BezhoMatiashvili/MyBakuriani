import type { Metadata } from "next";
import { notFound, unstable_rethrow } from "next/navigation";
import { getTranslations } from "next-intl/server";
import type { AppLocale } from "@/i18n/routing";
import {
  getServiceById,
  getServiceMetadataById,
} from "@/lib/data/getServiceById";
import {
  getCachedPublicService,
  getCachedPublicCvCount,
  getCvCountsForServices,
} from "@/lib/data/getCachedPublicListing";
import { withTimeout, DETAIL_AUX_TIMEOUT_MS } from "@/lib/with-timeout";
import { buildListingMetadata } from "@/lib/seo";
import type { ServiceWithFoodExtras } from "@/lib/mock/services";
import EmploymentDetailClient from "./EmploymentDetailClient";

interface Props {
  params: Promise<{ locale: AppLocale; id: string }>;
}

// Dynamic, not ISR: get(Property|Service)ById reads cookies() for the admin/owner
// pending-preview path, so this route cannot be statically cached (Next "static to dynamic").
// The cached fast-path below still serves anonymous visitors from the data cache.
export const dynamic = "force-dynamic";

// No build-time prerender — the empty list keeps the build free of any Supabase
// dependency; every request renders dynamically (force-dynamic above). dynamicParams=true.
export async function generateStaticParams() {
  return [];
}

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
    const applicationsCount = await getCachedPublicCvCount(id);
    return (
      <EmploymentDetailClient
        service={cached}
        isMock={false}
        applicationsCount={applicationsCount}
        isPending={false}
      />
    );
  }

  // Dynamic fallback: pending/blocked/missing, or owner/admin preview.
  const { data: service, isMock } = await getServiceById(id);

  if (!service) {
    notFound();
  }

  let applicationsCount = 0;
  if (isMock) {
    applicationsCount = 12;
  } else {
    applicationsCount = await withTimeout(
      getCvCountsForServices([id]).then((counts) => counts[id] ?? 0),
      DETAIL_AUX_TIMEOUT_MS,
      0,
    );
  }

  const isPending = !isMock && service.status !== "active";

  return (
    <EmploymentDetailClient
      service={service}
      isMock={isMock}
      applicationsCount={applicationsCount}
      isPending={isPending}
    />
  );
}
