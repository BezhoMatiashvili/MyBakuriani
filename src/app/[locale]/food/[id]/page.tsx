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
  getCachedPublicMenuItems,
  type PublicMenuItem,
} from "@/lib/data/getCachedPublicListing";
import { buildListingMetadata } from "@/lib/seo";
import type { ServiceWithFoodExtras } from "@/lib/mock/services";
import { isAdminViewer } from "@/lib/auth/is-admin-viewer";
import { getCurrentUser } from "@/lib/auth/current-user";
import { createClient, createPublicClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import FoodDetailClient from "./FoodDetailClient";

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

  // Fast path: cached public (active) service — zero DB round-trip on a cache
  // hit. A transient miss-time error throws (not cached) so it falls through to
  // the dynamic path instead of being served as not-found.
  let cached: ServiceWithFoodExtras | null = null;
  let cachedMenuItems: PublicMenuItem[] = [];
  try {
    [cached, cachedMenuItems] = await Promise.all([
      getCachedPublicService(id),
      getCachedPublicMenuItems(id),
    ]);
  } catch (err) {
    unstable_rethrow(err);
    cached = null;
    cachedMenuItems = [];
  }

  if (cached) {
    return (
      <FoodDetailClient
        service={cached}
        menuItems={cachedMenuItems}
        isMock={false}
        isPending={false}
      />
    );
  }

  // Dynamic fallback: pending/blocked/missing, or owner/admin preview.
  const { data: service, isMock } = await getServiceById(id);

  if (!service) {
    notFound();
  }

  const isPending = !isMock && service.status !== "active";

  // service_menu_items RLS restricts SELECT to the row owner only, so mirror
  // getServiceById's three-tier viewer client selection: admin bypasses RLS,
  // a signed-in owner reads their own rows via the cookie-carrying client,
  // anonymous sees none (fine — a non-owner already 404'd above).
  let menuItems: PublicMenuItem[] = [];
  if (!isMock) {
    const adminViewer = await isAdminViewer();
    const user = await getCurrentUser();
    const supabase = adminViewer
      ? createServiceClient()
      : user
        ? await createClient()
        : createPublicClient();
    const { data } = await supabase
      .from("service_menu_items")
      .select("*")
      .eq("service_id", id)
      .order("sort_order", { ascending: true });
    menuItems = (data as PublicMenuItem[] | null) ?? [];
  }

  return (
    <FoodDetailClient
      service={service}
      menuItems={menuItems}
      isMock={isMock}
      isPending={isPending}
    />
  );
}
