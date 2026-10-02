import { createPublicClient } from "@/lib/supabase/server";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import type { AppLocale } from "@/i18n/routing";
import { buildPageMetadata } from "@/lib/seo";
import SalesGridClient from "./SalesGridClient";
import { firstPhotoOnly } from "@/lib/utils/photos";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: AppLocale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Metadata" });
  return buildPageMetadata({
    locale,
    path: "/sales/all",
    title: t("salesAll"),
    description: t("salesAllDesc"),
    noindex: true,
  });
}

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function toCsv(value: string | string[] | undefined): string[] | undefined {
  if (typeof value !== "string" || !value) return undefined;
  return value
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

export default async function SalesGridPage({ searchParams }: Props) {
  const sp = await searchParams;
  // No cookies needed — filtering happens client-side from searchParams, so use
  // the anon client to avoid the auth overhead. (Page stays dynamic because it
  // reads searchParams.)
  const supabase = createPublicClient();

  // Only the columns SalesGridClient filters and renders (keep in sync with its
  // SaleGridListing type); the grid shows one photo per card.
  const { data: properties, error } = await supabase
    .from("public_properties")
    .select(
      "id, created_at, title, location, photos, type, sale_price, price_per_night, area_sqm, cadastral_code, rooms, capacity, amenities, house_rules, organization_id, developer, roi_percent, construction_status, construction_progress_percent, renovation_status, is_vip, is_super_vip, discount_percent, discount_expires_at, ownership_verified",
    )
    .eq("is_for_sale", true)
    .order("is_super_vip", { ascending: false })
    .order("is_vip", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    console.error("[sales/all] failed to load properties", error.message);
  }

  const initialType = typeof sp.type === "string" ? sp.type : undefined;
  const initialLocation =
    typeof sp.location === "string" ? sp.location : undefined;
  const initialPriceMin =
    typeof sp.price_min === "string" ? Number(sp.price_min) : undefined;
  const initialPriceMax =
    typeof sp.price_max === "string" ? Number(sp.price_max) : undefined;
  const initialAreaMin =
    typeof sp.area_min === "string" ? Number(sp.area_min) : undefined;
  const initialAreaMax =
    typeof sp.area_max === "string" ? Number(sp.area_max) : undefined;
  const initialCadastral =
    typeof sp.cadastral === "string" ? sp.cadastral : undefined;
  const initialRoiMin =
    typeof sp.roi_min === "string" ? Number(sp.roi_min) : undefined;
  const initialConstruction =
    typeof sp.construction === "string" ? sp.construction : undefined;
  const initialRenovation =
    typeof sp.renovation === "string" ? sp.renovation : undefined;

  return (
    <SalesGridClient
      properties={(properties ?? []).map(firstPhotoOnly)}
      initialType={initialType}
      initialTypes={toCsv(sp.types)}
      initialLocation={initialLocation}
      initialPriceMin={initialPriceMin}
      initialPriceMax={initialPriceMax}
      initialAreaMin={initialAreaMin}
      initialAreaMax={initialAreaMax}
      initialCadastral={initialCadastral}
      initialRooms={toCsv(sp.rooms)
        ?.map(Number)
        .filter((n) => !isNaN(n))}
      initialPayment={toCsv(sp.payment)}
      initialSellerTypes={toCsv(sp.seller)}
      initialRoiMin={initialRoiMin}
      initialConstruction={initialConstruction}
      initialRenovation={initialRenovation}
    />
  );
}
