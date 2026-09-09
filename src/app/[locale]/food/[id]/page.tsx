import type { Metadata } from "next";
import { notFound, unstable_rethrow } from "next/navigation";
import { getTranslations } from "next-intl/server";
import type { AppLocale } from "@/i18n/routing";
import { getMockService, isMockServiceId } from "@/lib/mock/services";
import type { ServiceWithFoodExtras } from "@/lib/mock/services";
import {
  getCachedPublicService,
  getCachedPublicMenuItems,
  type PublicMenuItem,
} from "@/lib/data/getCachedPublicListing";
import { buildListingMetadata } from "@/lib/seo";
import FoodDetailClient from "./FoodDetailClient";

interface Props {
  params: Promise<{ locale: AppLocale; id: string }>;
}

// ISR (on-demand): rendered on first request per id, cached and edge-cacheable
// (s-maxage=60), revalidated every 60s and purged by revalidateTag
// ("service:<id>"). This route must NEVER touch cookies()/headers()/auth on any
// code path — a runtime static→dynamic flip is a hard 500 in Next 15 (E132),
// not a graceful bail-out. Owner/admin preview of pending listings lives under
// /preview/food/[id] (force-dynamic), reached via the middleware rewrite on
// ?preview=1 + auth cookie. Keep the literal in sync with
// PUBLIC_LISTING_REVALIDATE_S (segment config must be a literal).
export const revalidate = 60;

// No build-time prerender — the empty list keeps the build free of any Supabase
// dependency; each id renders on first request (dynamicParams default true).
export async function generateStaticParams() {
  return [];
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, id } = await params;
  const t = await getTranslations({ locale, namespace: "Metadata" });
  // Cached public listing only — the cookie-aware metadata fallback lives on
  // the /preview route. A miss (pending/blocked/deleted) gets the not-found title.
  const data = isMockServiceId(id)
    ? getMockService(id)
    : await getCachedPublicService(id).catch(() => null);

  if (!data) {
    return { title: t("detail.foodNotFound") };
  }

  const title = t("detail.foodTitle", { title: data.title });
  const description =
    data.description ?? t("detail.foodDesc", { title: data.title });

  return {
    title,
    description,
    ...buildListingMetadata({
      locale,
      title,
      description,
      images: data.photos ?? [],
      path: `/food/${id}`,
    }),
  };
}

export default async function FoodDetailPage({ params }: Props) {
  const { id } = await params;

  // Mock ids are non-UUID, so the cached fetch below would return null for
  // them; branch explicitly to keep demo listings rendering.
  if (isMockServiceId(id)) {
    const mock = getMockService(id);
    if (!mock) notFound();
    return (
      <FoodDetailClient
        service={mock}
        menuItems={[]}
        isMock={true}
        isPending={false}
      />
    );
  }

  // Cached public (active) service + menu — zero DB round-trip on cache hits.
  // A transient miss-time error rethrows so this render fails (uncached)
  // instead of caching a 404 of a live listing for the next 60s.
  let cached: ServiceWithFoodExtras | null = null;
  let cachedMenuItems: PublicMenuItem[] = [];
  try {
    [cached, cachedMenuItems] = await Promise.all([
      getCachedPublicService(id),
      getCachedPublicMenuItems(id),
    ]);
  } catch (err) {
    unstable_rethrow(err);
    throw err;
  }

  if (!cached) {
    notFound();
  }

  return (
    <FoodDetailClient
      service={cached}
      menuItems={cachedMenuItems}
      isMock={false}
      isPending={false}
    />
  );
}
