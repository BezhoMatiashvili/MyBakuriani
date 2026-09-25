import { createPublicClient } from "@/lib/supabase/server";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import type { AppLocale } from "@/i18n/routing";
import TransportPageClient from "./TransportPageClient";

export const revalidate = 60;

// Fetch window for the flat, unpaginated query below. Well above any realistic
// active-transport-listing count today (4) so the client's full filter/sort/
// paginate pipeline sees the whole catalog, not a truncated slice.
const MAX_LISTINGS = 1000;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: AppLocale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Metadata" });
  return {
    title: t("transport"),
    description: t("transportDesc"),
  };
}

export default async function TransportPage() {
  const supabase = createPublicClient();

  const {
    data: services,
    error,
    count,
  } = await supabase
    .from("public_services")
    // Only the columns the transport cards + filters use — keeps the
    // prerendered RSC payload small. Keep in sync with TransportService.
    .select(
      "id, title, category, location, photos, price, price_unit, discount_percent, discount_expires_at, is_vip, is_super_vip, has_whatsapp, profile_is_verified, transport_type, vehicle_capacity, vehicle_make, vehicle_color, features, route, routes, created_at",
      { count: "exact" },
    )
    .eq("category", "transport")
    .order("is_super_vip", { ascending: false })
    .order("is_vip", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(MAX_LISTINGS);

  if (error) throw error;

  if ((count ?? 0) > (services?.length ?? 0)) {
    console.warn(
      `[transport] fetched ${services?.length ?? 0} of ${count} active listings; rows beyond the ${MAX_LISTINGS}-row window are unreachable`,
    );
  }

  return <TransportPageClient services={services ?? []} />;
}
