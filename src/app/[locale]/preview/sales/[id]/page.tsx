import type { Metadata } from "next";
import { notFound, unstable_rethrow } from "next/navigation";
import { getTranslations } from "next-intl/server";
import type { AppLocale } from "@/i18n/routing";
import { createPublicClient } from "@/lib/supabase/server";
import { smsFeatureMode } from "@/lib/sms/feature-flags";
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
import SaleDetailClient from "@/app/[locale]/sales/[id]/SaleDetailClient";

interface Props {
  params: Promise<{ locale: AppLocale; id: string }>;
}

// Owner/admin preview route: force-dynamic because get(Property|Service)ById
// reads cookies() to let a creator/admin view a pending listing. The public
// /sales/[id] route is ISR and cookie-free; middleware rewrites ?preview=1
// requests (with an auth cookie) here so the browser URL stays the public one.
export const dynamic = "force-dynamic";

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
    return { title: t("detail.saleNotFound"), robots: { index: false } };
  }

  const title = t("detail.saleTitle", { title: data.title });
  const description =
    data.description ??
    t("detail.saleDesc", { title: data.title, location: data.location });

  return {
    title,
    description,
    robots: { index: false },
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
  // Owner/QA visibility is handled client-side by PriceDropAlertButton (via
  // useAuth) — same as the public ISR route; only the mode is read here.
  const priceAlertMode = smsFeatureMode("SMS_PRICE_DROP_MODE");

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
      <SaleDetailClient
        property={cached}
        reviews={reviews}
        isPending={false}
        priceAlertMode={priceAlertMode}
      />
    );
  }

  // Dynamic fallback: pending/blocked/missing, or owner/admin preview (reads
  // cookies via getPropertyById).
  const { data: property, isMock } = await getPropertyById(id);

  if (!property) {
    notFound();
  }

  if (isMock) {
    return (
      <SaleDetailClient
        property={property}
        reviews={[]}
        priceAlertMode={priceAlertMode}
      />
    );
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
      priceAlertMode={priceAlertMode}
    />
  );
}
