export const RENT_PRICE_MIN = 0;
export const RENT_PRICE_MAX = 1000;

export interface RentAdvancedFilters {
  priceMin: number;
  priceMax: number;
  bedrooms: number | null;
  bathrooms: number | null;
  capacity: number | null;
  amenities: string[];
  verifiedOnly: boolean;
}

export const DEFAULT_RENT_FILTERS: RentAdvancedFilters = {
  priceMin: RENT_PRICE_MIN,
  priceMax: RENT_PRICE_MAX,
  bedrooms: null,
  bathrooms: null,
  capacity: null,
  amenities: [],
  verifiedOnly: false,
};

export interface RentSearchValues {
  location: string;
  checkIn: string;
  checkOut: string;
  guests: number | "";
  keyword: string;
  advancedFilters: RentAdvancedFilters;
}

interface SearchParamReader {
  get(name: string): string | null;
}

function finiteNumber(value: string | null): number | null {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function normalizeRentFilters(
  filters?: Partial<RentAdvancedFilters> | null,
): RentAdvancedFilters {
  const priceMin = Math.max(
    RENT_PRICE_MIN,
    Math.min(filters?.priceMin ?? RENT_PRICE_MIN, RENT_PRICE_MAX - 1),
  );
  const priceMax = Math.min(
    RENT_PRICE_MAX,
    Math.max(filters?.priceMax ?? RENT_PRICE_MAX, priceMin + 1),
  );

  return {
    priceMin,
    priceMax,
    bedrooms: filters?.bedrooms ?? null,
    bathrooms: filters?.bathrooms ?? null,
    capacity: filters?.capacity ?? null,
    amenities: [...(filters?.amenities ?? [])],
    verifiedOnly: filters?.verifiedOnly ?? false,
  };
}

export function buildRentSearchParams(
  values: RentSearchValues,
  mode: "rent" | "sale" = "rent",
): URLSearchParams {
  const params = new URLSearchParams();
  const filters = normalizeRentFilters(values.advancedFilters);

  if (values.location) params.set("location", values.location);
  if (values.checkIn) params.set("check_in", values.checkIn);
  if (values.checkOut) params.set("check_out", values.checkOut);
  if (values.guests) params.set("guests", String(values.guests));
  if (values.keyword) params.set("q", values.keyword);
  params.set("mode", mode);
  if (filters.priceMin > RENT_PRICE_MIN) {
    params.set("price_min", String(filters.priceMin));
  }
  if (filters.priceMax < RENT_PRICE_MAX) {
    params.set("price_max", String(filters.priceMax));
  }
  if (filters.bedrooms !== null) {
    params.set("rooms", String(filters.bedrooms));
  }
  if (filters.bathrooms !== null) {
    params.set("bathrooms", String(filters.bathrooms));
  }
  if (filters.amenities.length > 0) {
    params.set("amenities", filters.amenities.join(","));
  }
  if (filters.verifiedOnly) params.set("verified_only", "true");

  return params;
}

export function parseRentSearchParams(params: SearchParamReader): {
  values: RentSearchValues;
  mode: "rent" | "sale";
} {
  const priceMin = finiteNumber(params.get("price_min"));
  const priceMax = finiteNumber(params.get("price_max"));
  const guests = finiteNumber(params.get("guests"));
  const rooms = finiteNumber(params.get("rooms"));
  const bathrooms = finiteNumber(params.get("bathrooms"));
  const amenities = (params.get("amenities") ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  return {
    mode: params.get("mode") === "sale" ? "sale" : "rent",
    values: {
      location: params.get("location") ?? "",
      checkIn: params.get("check_in") ?? "",
      checkOut: params.get("check_out") ?? "",
      guests: guests === null ? "" : guests,
      keyword: params.get("q") ?? "",
      advancedFilters: normalizeRentFilters({
        priceMin: priceMin ?? RENT_PRICE_MIN,
        priceMax: priceMax ?? RENT_PRICE_MAX,
        bedrooms: rooms,
        bathrooms,
        capacity: guests,
        amenities,
        verifiedOnly:
          params.get("verified_only") === "true" ||
          params.get("verified_only") === "1",
      }),
    },
  };
}
