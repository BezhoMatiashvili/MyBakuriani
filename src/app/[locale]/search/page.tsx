import type { Metadata } from "next";
import { createPublicClient } from "@/lib/supabase/server";
import { getTranslations } from "next-intl/server";
import type { AppLocale } from "@/i18n/routing";
import { buildPageMetadata } from "@/lib/seo";
import { sanitizeQuery } from "@/lib/utils/sanitizeQuery";
import { getLiveStatusCards } from "@/lib/status-cards/live";
import { DETAIL_AUX_TIMEOUT_MS } from "@/lib/with-timeout";
import SearchPageClient from "./SearchPageClient";
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
    path: "/search",
    title: t("search"),
    description: t("searchDesc"),
    noindex: true,
  });
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

const PROPERTY_TYPES = [
  "flat",
  "apartment",
  "cottage",
  "hotel",
  "studio",
  "villa",
  "house",
  "land",
] as const;
type PropertyType = (typeof PROPERTY_TYPES)[number];

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

function parsePropertyTypes(value?: string): PropertyType[] {
  return parseStringList(value).filter((item): item is PropertyType =>
    (PROPERTY_TYPES as readonly string[]).includes(item),
  );
}

function parseBoolean(value?: string): boolean {
  return value === "true" || value === "1";
}

export default async function SearchPage({ searchParams }: SearchPageProps) {
  const params = await searchParams;
  // Anon client — search reads only active listings and filters by searchParams
  // (already dynamic), so there's no need for the cookie-bound client's auth cost.
  const supabase = createPublicClient();

  // Only the columns SearchPageClient reads, including those its offline
  // fallback filter uses (keep in sync with SearchListing there).
  let query = supabase
    .from("public_properties")
    .select(
      "id, created_at, title, description, location, cadastral_code, photos, price_per_night, sale_price, capacity, rooms, bathrooms, area_sqm, type, amenities, is_vip, is_super_vip, discount_percent, discount_expires_at, is_for_sale, house_rules, ownership_verified",
    );

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

  const priceMin = parseNumeric(params.price_min);
  const priceMax = parseNumeric(params.price_max);
  const rooms = parseNumeric(params.rooms);
  const bathrooms = parseNumeric(params.bathrooms);
  const guests = parseNumeric(params.guests);
  const areaMin = parseNumeric(params.area_min);
  const areaMax = parseNumeric(params.area_max);
  const types = parsePropertyTypes(params.types);
  const amenities = parseStringList(params.amenities);
  const priceColumn = params.mode === "sale" ? "sale_price" : "price_per_night";

  if (priceMin !== "") query = query.gte(priceColumn, priceMin);
  if (priceMax !== "") query = query.lte(priceColumn, priceMax);
  if (rooms !== "") query = query.gte("rooms", rooms);
  if (bathrooms !== "") query = query.gte("bathrooms", bathrooms);
  if (guests !== "") query = query.gte("capacity", guests);
  if (areaMin !== "") query = query.gte("area_sqm", areaMin);
  if (areaMax !== "") query = query.lte("area_sqm", areaMax);
  if (types.length === 1) query = query.eq("type", types[0]);
  if (types.length > 1) query = query.in("type", types);
  for (const amenity of amenities) {
    query = query.contains("amenities", [amenity]);
  }
  if (parseBoolean(params.verified_only)) {
    query = query.eq("ownership_verified", true);
  }

  // This page renders per request, so the live-card reads get the short
  // secondary-read budget: a slow provider falls back to the admin card instead
  // of holding the results.
  const [statusCards, { data: properties }] = await Promise.all([
    getLiveStatusCards(DETAIL_AUX_TIMEOUT_MS),
    query
      .order("is_super_vip", { ascending: false })
      .order("is_vip", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(100),
  ]);

  return (
    <SearchPageClient
      initialProperties={(properties ?? []).map(firstPhotoOnly)}
      statusCards={statusCards}
      initialLocation={params.location ?? ""}
      initialCheckIn={params.check_in ?? ""}
      initialCheckOut={params.check_out ?? ""}
      initialGuests={params.guests ? Number(params.guests) : ""}
      initialKeyword={params.q ?? ""}
      initialMode={(params.mode as "rent" | "sale") ?? "rent"}
      initialFilters={{
        priceMin,
        priceMax,
        rooms: rooms === "" ? null : rooms,
        bathrooms: bathrooms === "" ? null : bathrooms,
        areaMin,
        areaMax,
        types,
        amenities,
        verifiedOnly: parseBoolean(params.verified_only),
      }}
    />
  );
}
