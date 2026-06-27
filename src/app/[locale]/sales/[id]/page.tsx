import type { Metadata } from "next";
import { notFound, unstable_rethrow } from "next/navigation";
import { getTranslations } from "next-intl/server";
import type { AppLocale } from "@/i18n/routing";
import { createPublicClient } from "@/lib/supabase/server";
import {
  getPropertyById,
  getPropertyMetadataById,
  type PropertyWithProfile,
} from "@/lib/data/getPropertyById";
import {
  getCachedPublicProperty,
  getCachedPublicReviews,
  type PublicReviews,
} from "@/lib/data/getCachedPublicListing";
import { withTimeout, DETAIL_AUX_TIMEOUT_MS } from "@/lib/with-timeout";
import { buildListingMetadata } from "@/lib/seo";
import SaleDetailClient from "./SaleDetailClient";

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
  // Fast path: the cached public listing, so a starved DB doesn't stall metadata.
  const cached = await getCachedPublicProperty(id).catch(() => null);
  const data = cached
    ? {
        title: cached.title,
        location: cached.location,
        description: cached.description,
        photos: cached.photos,
      }
    : await getPropertyMetadataById(id);

  if (!data) {
    return { title: t("detail.saleNotFound") };
  }

  const title = t("detail.saleTitle", { title: data.title });
  const description =
    data.description ??
    t("detail.saleDesc", { title: data.title, location: data.location });

  return {
    title,
    description,
    ...buildListingMetadata({
      locale,
      title,
      description,
      images: data.photos ?? [],
      path: `/sales/${id}`,
    }),
  };
}

export default async function SaleDetailPage({ params }: Props) {
  const { id } = await params;

  // Fast path: cached public (active) listing — zero DB round-trip on a cache
  // hit, served to everyone. A transient miss-time error throws (not cached) so
  // it falls through to the dynamic path instead of being served as not-found.
  let cached: PropertyWithProfile | null = null;
  try {
    cached = await getCachedPublicProperty(id);
  } catch (err) {
    unstable_rethrow(err);
    cached = null;
  }

  if (cached) {
    const reviews = await getCachedPublicReviews(id);
    return (
      <SaleDetailClient property={cached} reviews={reviews} isPending={false} />
    );
  }

  // Dynamic fallback: pending/blocked/missing, or owner/admin preview (reads
  // cookies via getPropertyById).
  const { data: property, isMock } = await getPropertyById(id);

  if (!property) {
    notFound();
  }

  if (isMock) {
    return <SaleDetailClient property={property} reviews={[]} />;
  }

  const supabase = createPublicClient();
  const reviews = await withTimeout(
    supabase
      .from("reviews")
      .select("*, profiles!reviews_guest_id_fkey(display_name)")
      .eq("property_id", id)
      .order("created_at", { ascending: false })
      .limit(20)
      .then((r) => r.data ?? []),
    DETAIL_AUX_TIMEOUT_MS,
    [] as PublicReviews,
  );

  const isPending = property.status !== "active";

  return (
    <SaleDetailClient
      property={property}
      reviews={reviews}
      isPending={isPending}
    />
  );
}
