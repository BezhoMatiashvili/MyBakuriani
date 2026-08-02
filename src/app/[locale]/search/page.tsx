import type { Metadata } from "next";
import { createPublicClient } from "@/lib/supabase/server";
import { getTranslations } from "next-intl/server";
import type { AppLocale } from "@/i18n/routing";
import { sanitizeQuery } from "@/lib/utils/sanitizeQuery";
import { getStatusCards } from "@/lib/status-cards/server";
import SearchPageClient from "./SearchPageClient";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: AppLocale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Metadata" });
  return {
    title: t("search"),
    description: t("searchDesc"),
  };
}

interface SearchPageProps {
  searchParams: Promise<{
    location?: string;
    check_in?: string;
    check_out?: string;
    guests?: string;
    q?: string;
    mode?: string;
    price_min?: string;
    price_max?: string;
    rooms?: string;
    bathrooms?: string;
    area_min?: string;
    area_max?: string;
    types?: string;
    amenities?: string;
    verified_only?: string;
  }>;
}

function parseNumeric(value?: string): number | "" {
  if (!value) return "";
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : "";
}

function parseStringList(value?: string): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseBoolean(value?: string): boolean {
  return value === "true" || value === "1";
}

export default async function SearchPage({ searchParams }: SearchPageProps) {
  const params = await searchParams;
  // Anon client — search reads only active listings and filters by searchParams
  // (already dynamic), so there's no need for the cookie-bound client's auth cost.
  const supabase = createPublicClient();

  let query = supabase.from("public_properties").select("*");

  // Apply mode filter server-side so initial data matches
  if (params.mode === "sale") {
    query = query.eq("is_for_sale", true);
  } else {
    query = query.eq("is_for_sale", false);
  }

  // Apply location filter server-side if provided
  if (params.location) {
    const safeLocation = sanitizeQuery(params.location);
    query = query.or(
      `location.ilike.%${safeLocation}%,title.ilike.%${safeLocation}%`,
    );
  }

  const [statusCards, { data: properties }] = await Promise.all([
    getStatusCards(),
    query
      .order("is_super_vip", { ascending: false })
      .order("is_vip", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(100),
  ]);

  return (
    <SearchPageClient
      initialProperties={properties ?? []}
      statusCards={statusCards}
      initialLocation={params.location ?? ""}
      initialCheckIn={params.check_in ?? ""}
      initialCheckOut={params.check_out ?? ""}
      initialGuests={params.guests ? Number(params.guests) : ""}
      initialKeyword={params.q ?? ""}
      initialMode={(params.mode as "rent" | "sale") ?? "rent"}
      initialFilters={{
        priceMin: parseNumeric(params.price_min),
        priceMax: parseNumeric(params.price_max),
        rooms: parseNumeric(params.rooms) === "" ? null : Number(params.rooms),
        bathrooms:
          parseNumeric(params.bathrooms) === ""
            ? null
            : Number(params.bathrooms),
        areaMin: parseNumeric(params.area_min),
        areaMax: parseNumeric(params.area_max),
        types: parseStringList(params.types),
        amenities: parseStringList(params.amenities),
        verifiedOnly: parseBoolean(params.verified_only),
      }}
    />
  );
}
