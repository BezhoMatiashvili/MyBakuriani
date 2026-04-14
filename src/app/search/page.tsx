import { createClient } from "@/lib/supabase/server";
import SearchPageClient from "./SearchPageClient";

export const metadata = {
  title: "MyBakuriani — ძებნა",
  description: "მოძებნეთ აპარტამენტები, სასტუმროები და სერვისები ბაკურიანში.",
};

interface SearchPageProps {
  searchParams: Promise<{
    location?: string;
    check_in?: string;
    check_out?: string;
    guests?: string;
    cadastral?: string;
    mode?: string;
    price_min?: string;
    price_max?: string;
    rooms?: string;
    area_min?: string;
    area_max?: string;
    types?: string;
    amenities?: string;
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

export default async function SearchPage({ searchParams }: SearchPageProps) {
  const params = await searchParams;
  const supabase = await createClient();

  let query = supabase.from("properties").select("*").eq("status", "active");

  // Apply mode filter server-side so initial data matches
  if (params.mode === "sale") {
    query = query.eq("is_for_sale", true);
  } else {
    query = query.eq("is_for_sale", false);
  }

  // Apply location filter server-side if provided
  if (params.location) {
    query = query.or(
      `location.ilike.%${params.location}%,title.ilike.%${params.location}%`,
    );
  }

  const { data: properties } = await query
    .order("is_super_vip", { ascending: false })
    .order("is_vip", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(100);

  return (
    <SearchPageClient
      initialProperties={properties ?? []}
      initialLocation={params.location ?? ""}
      initialCheckIn={params.check_in ?? ""}
      initialCheckOut={params.check_out ?? ""}
      initialGuests={params.guests ? Number(params.guests) : ""}
      initialCadastral={params.cadastral ?? ""}
      initialMode={(params.mode as "rent" | "sale") ?? "rent"}
      initialFilters={{
        priceMin: parseNumeric(params.price_min),
        priceMax: parseNumeric(params.price_max),
        rooms: parseNumeric(params.rooms) === "" ? null : Number(params.rooms),
        areaMin: parseNumeric(params.area_min),
        areaMax: parseNumeric(params.area_max),
        types: parseStringList(params.types),
        amenities: parseStringList(params.amenities),
      }}
    />
  );
}
