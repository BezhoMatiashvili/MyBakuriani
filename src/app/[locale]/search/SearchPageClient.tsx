"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { SlidersHorizontal } from "lucide-react";
import type { Tables } from "@/lib/types/database";
import PropertyCard from "@/components/cards/PropertyCard";
import {
  FilterPanel,
  DEFAULT_FILTERS,
  type Filters,
} from "@/components/search/FilterPanel";
import { SearchBox, type SearchFilters } from "@/components/search/SearchBox";
import { RentBuyToggle } from "@/components/search/RentBuyToggle";
import BottomSheet from "@/components/shared/BottomSheet";
import ScrollReveal from "@/components/shared/ScrollReveal";
import { Button } from "@/components/ui/button";

const ITEMS_PER_PAGE = 12;

interface Props {
  initialProperties: Tables<"properties">[];
  initialLocation?: string;
  initialCheckIn?: string;
  initialCheckOut?: string;
  initialGuests?: number | "";
  initialCadastral?: string;
  initialMode?: "rent" | "sale";
  initialFilters?: Filters;
}

interface SearchState {
  location: string;
  checkIn: string;
  checkOut: string;
  guests: number | "";
  cadastralCode: string;
}

export default function SearchPageClient({
  initialProperties,
  initialLocation = "",
  initialCheckIn = "",
  initialCheckOut = "",
  initialGuests = "",
  initialCadastral = "",
  initialMode = "rent",
  initialFilters = DEFAULT_FILTERS,
}: Props) {
  const [filters, setFilters] = useState<Filters>(initialFilters);
  const [searchState, setSearchState] = useState<SearchState>({
    location: initialLocation,
    checkIn: initialCheckIn,
    checkOut: initialCheckOut,
    guests: initialGuests,
    cadastralCode: initialCadastral,
  });
  const [mode, setMode] = useState<"rent" | "sale">(initialMode);
  const [page, setPage] = useState(1);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [properties, setProperties] =
    useState<Tables<"properties">[]>(initialProperties);
  const [totalCount, setTotalCount] = useState(initialProperties.length);
  const [loading, setLoading] = useState(false);
  const isInitialMount = useRef(true);
  const isFirstUrlSync = useRef(true);
  const router = useRouter();

  const fetchProperties = useCallback(
    async (
      search: SearchState,
      currentFilters: Filters,
      currentMode: "rent" | "sale",
      currentPage: number,
    ) => {
      setLoading(true);
      try {
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
        const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

        const body: Record<string, unknown> = {
          page: currentPage,
          per_page: ITEMS_PER_PAGE,
        };

        // Search query (location or cadastral)
        if (search.location) body.query = search.location;
        if (search.cadastralCode) body.cadastral_code = search.cadastralCode;
        if (search.checkIn) body.check_in = search.checkIn;
        if (search.checkOut) body.check_out = search.checkOut;
        if (search.guests) body.capacity = search.guests;

        // Rent/Sale mode
        body.is_for_sale = currentMode === "sale";

        // Filters
        if (currentFilters.priceMin !== "")
          body.price_min = currentFilters.priceMin;
        if (currentFilters.priceMax !== "")
          body.price_max = currentFilters.priceMax;
        if (currentFilters.rooms !== null) body.rooms = currentFilters.rooms;
        if (currentFilters.bathrooms !== null)
          body.bathrooms = currentFilters.bathrooms;
        if (currentFilters.types.length === 1)
          body.property_type = currentFilters.types[0];
        if (currentFilters.areaMin !== "")
          body.area_min = currentFilters.areaMin;
        if (currentFilters.areaMax !== "")
          body.area_max = currentFilters.areaMax;
        if (currentFilters.amenities.length > 0)
          body.amenities = currentFilters.amenities;
        if (currentFilters.verifiedOnly) body.verified_only = true;

        const response = await fetch(`${supabaseUrl}/functions/v1/search`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${anonKey}`,
            apikey: anonKey,
          },
          body: JSON.stringify(body),
        });

        if (!response.ok) {
          throw new Error("Search request failed");
        }

        const result = await response.json();
        let data: Tables<"properties">[] = result.data || [];

        // Client-side: multiple property types (edge function only supports single type)
        if (currentFilters.types.length > 1) {
          data = data.filter((p) => currentFilters.types.includes(p.type));
        }

        setProperties(data);
        setTotalCount(result.total ?? data.length);
      } catch {
        // Fallback to client-side filtering of initial data
        let filtered = initialProperties;

        // Text search
        if (search.location) {
          const q = search.location.toLowerCase();
          filtered = filtered.filter(
            (p) =>
              p.title.toLowerCase().includes(q) ||
              p.location?.toLowerCase().includes(q),
          );
        }
        if (search.cadastralCode) {
          filtered = filtered.filter((p) =>
            p.cadastral_code
              ?.toLowerCase()
              .includes(search.cadastralCode.toLowerCase()),
          );
        }

        // Rent/Sale mode
        filtered = filtered.filter((p) =>
          currentMode === "sale" ? p.is_for_sale : !p.is_for_sale,
        );

        // Price
        const priceField =
          currentMode === "sale" ? "sale_price" : "price_per_night";
        if (currentFilters.priceMin !== "") {
          filtered = filtered.filter(
            (p) =>
              Number(p[priceField] ?? 0) >= Number(currentFilters.priceMin),
          );
        }
        if (currentFilters.priceMax !== "") {
          filtered = filtered.filter(
            (p) =>
              Number(p[priceField] ?? 0) <= Number(currentFilters.priceMax),
          );
        }

        // Rooms
        if (currentFilters.rooms !== null) {
          filtered = filtered.filter(
            (p) => p.rooms !== null && p.rooms >= currentFilters.rooms!,
          );
        }
        if (currentFilters.bathrooms !== null) {
          filtered = filtered.filter(
            (p) =>
              p.bathrooms !== null && p.bathrooms >= currentFilters.bathrooms!,
          );
        }

        // Area
        if (currentFilters.areaMin !== "") {
          filtered = filtered.filter(
            (p) => (p.area_sqm ?? 0) >= Number(currentFilters.areaMin),
          );
        }
        if (currentFilters.areaMax !== "") {
          filtered = filtered.filter(
            (p) => (p.area_sqm ?? 0) <= Number(currentFilters.areaMax),
          );
        }

        // Property types
        if (currentFilters.types.length > 0) {
          filtered = filtered.filter((p) =>
            currentFilters.types.includes(p.type),
          );
        }

        // Amenities
        if (currentFilters.amenities.length > 0) {
          filtered = filtered.filter((p) => {
            const propertyAmenities = Array.isArray(p.amenities)
              ? p.amenities
              : [];
            return currentFilters.amenities.every((a) =>
              propertyAmenities.includes(a),
            );
          });
        }

        // Verified owners (best-effort on fallback data shape)
        if (currentFilters.verifiedOnly) {
          filtered = filtered.filter(
            (p) =>
              (p as { profiles?: { is_verified?: boolean } }).profiles
                ?.is_verified,
          );
        }

        // Guests
        if (search.guests) {
          filtered = filtered.filter(
            (p) => p.capacity && p.capacity >= Number(search.guests),
          );
        }

        setProperties(filtered);
        setTotalCount(filtered.length);
      } finally {
        setLoading(false);
      }
    },
    [initialProperties],
  );

  // Re-fetch when filters change. On first render, fetch if URL has criteria
  // that the server-side initial query does not fully apply.
  useEffect(() => {
    if (isInitialMount.current) {
      const hasInitialCriteriaToFetch =
        !!searchState.checkIn ||
        !!searchState.checkOut ||
        !!searchState.guests ||
        !!searchState.cadastralCode ||
        filters.priceMin !== "" ||
        filters.priceMax !== "" ||
        filters.rooms !== null ||
        filters.bathrooms !== null ||
        filters.areaMin !== "" ||
        filters.areaMax !== "" ||
        filters.types.length > 0 ||
        filters.amenities.length > 0 ||
        filters.verifiedOnly;
      isInitialMount.current = false;
      if (!hasInitialCriteriaToFetch) return;
    }
    fetchProperties(searchState, filters, mode, page);
  }, [filters, mode, page, fetchProperties, searchState]);

  // Sync URL with current search state (so refresh/share preserves filters)
  useEffect(() => {
    if (isFirstUrlSync.current) {
      isFirstUrlSync.current = false;
      return;
    }
    const params = new URLSearchParams();
    if (searchState.location) params.set("location", searchState.location);
    if (searchState.checkIn) params.set("check_in", searchState.checkIn);
    if (searchState.checkOut) params.set("check_out", searchState.checkOut);
    if (searchState.guests) params.set("guests", String(searchState.guests));
    if (searchState.cadastralCode)
      params.set("cadastral", searchState.cadastralCode);
    params.set("mode", mode);
    if (filters.priceMin !== "")
      params.set("price_min", String(filters.priceMin));
    if (filters.priceMax !== "")
      params.set("price_max", String(filters.priceMax));
    if (filters.rooms !== null) params.set("rooms", String(filters.rooms));
    if (filters.bathrooms !== null)
      params.set("bathrooms", String(filters.bathrooms));
    if (filters.areaMin !== "") params.set("area_min", String(filters.areaMin));
    if (filters.areaMax !== "") params.set("area_max", String(filters.areaMax));
    if (filters.types.length > 0) params.set("types", filters.types.join(","));
    if (filters.amenities.length > 0)
      params.set("amenities", filters.amenities.join(","));
    if (filters.verifiedOnly) params.set("verified_only", "true");
    router.replace(`/search?${params.toString()}`, { scroll: false });
  }, [searchState, mode, filters, router]);

  const handleSearch = useCallback((sf: SearchFilters) => {
    const adv = sf.advancedFilters;
    if (adv) {
      const normalizedRooms =
        adv.bedrooms === "4+" ? 4 : adv.bedrooms ? Number(adv.bedrooms) : null;
      const normalizedBathrooms =
        adv.bathrooms === "3+"
          ? 3
          : adv.bathrooms
            ? Number(adv.bathrooms)
            : null;
      setFilters((prev) => ({
        ...prev,
        priceMin: adv.priceMin,
        priceMax: adv.priceMax,
        rooms: normalizedRooms,
        bathrooms: normalizedBathrooms,
        amenities: adv.amenities,
        verifiedOnly: adv.verifiedOnly,
      }));
    }
    setSearchState({
      location: sf.location,
      checkIn: sf.checkIn,
      checkOut: sf.checkOut,
      guests: sf.guests,
      cadastralCode: sf.cadastralCode,
    });
    setPage(1);
  }, []);

  const handleModeChange = useCallback((newMode: "rent" | "sale") => {
    setMode(newMode);
    setPage(1);
  }, []);

  const totalPages = Math.ceil(totalCount / ITEMS_PER_PAGE);

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <div className="mx-auto max-w-7xl px-4 py-8">
        {/* Search bar + RentBuyToggle */}
        <ScrollReveal>
          <div className="mb-4 flex justify-center">
            <RentBuyToggle value={mode} onChange={handleModeChange} />
          </div>
          <SearchBox
            onSearch={handleSearch}
            className="mb-8"
            defaultLocation={initialLocation}
            defaultGuests={initialGuests}
            defaultCadastralCode={initialCadastral}
            defaultCheckIn={initialCheckIn}
            defaultCheckOut={initialCheckOut}
          />
        </ScrollReveal>

        <div className="flex gap-8">
          {/* Desktop filter sidebar */}
          <aside className="hidden w-[280px] shrink-0 lg:block">
            <div className="sticky top-24">
              <h2 className="mb-4 text-[10px] font-bold uppercase tracking-[1px] text-[#94A3B8]">
                ფილტრები
              </h2>
              <FilterPanel filters={filters} onFilterChange={setFilters} />
            </div>
          </aside>

          {/* Results area */}
          <div className="min-w-0 flex-1">
            {/* Mobile filter button */}
            <div className="mb-4 flex items-center justify-between lg:hidden">
              <span className="text-[13px] font-medium leading-[20px] text-[#64748B]">
                {totalCount} შედეგი
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setMobileFiltersOpen(true)}
                className="gap-2"
              >
                <SlidersHorizontal className="h-4 w-4" />
                ფილტრები
              </Button>
            </div>

            {/* Results count — desktop */}
            <div className="mb-6 hidden items-center justify-between lg:flex">
              <h1 className="text-[26px] font-black leading-[32px] text-[#1E293B]">
                {mode === "sale" ? "გასაყიდი ობიექტები" : "ძებნის შედეგები"}
              </h1>
              <span className="text-[13px] font-medium leading-[20px] text-[#64748B]">
                {totalCount} შედეგი
              </span>
            </div>

            {/* Loading state */}
            {loading && (
              <div className="flex items-center justify-center py-20">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-accent border-t-transparent" />
              </div>
            )}

            {/* Empty state */}
            {!loading && properties.length === 0 && (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <p className="text-[17px] font-black leading-[21px] text-[#1E293B]">
                  შედეგი ვერ მოიძებნა
                </p>
                <p className="mt-2 text-[13px] leading-[20px] text-[#64748B]">
                  სცადეთ სხვა საძიებო სიტყვა ან შეცვალეთ ფილტრები
                </p>
              </div>
            )}

            {/* Property grid */}
            {!loading && (
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-3">
                {properties.map((p, i) => (
                  <ScrollReveal key={p.id} delay={i * 0.05}>
                    <PropertyCard
                      id={p.id}
                      title={p.title}
                      location={p.location}
                      photos={p.photos ?? []}
                      pricePerNight={
                        p.price_per_night ? Number(p.price_per_night) : null
                      }
                      salePrice={p.sale_price ? Number(p.sale_price) : null}
                      rating={null}
                      capacity={p.capacity}
                      rooms={p.rooms}
                      isVip={p.is_vip ?? false}
                      isSuperVip={p.is_super_vip ?? false}
                      discountPercent={p.discount_percent ?? 0}
                      isForSale={p.is_for_sale ?? false}
                    />
                  </ScrollReveal>
                ))}
              </div>
            )}

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="mt-10 flex items-center justify-center gap-2">
                <button
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                  className="flex h-10 w-10 items-center justify-center rounded-full border border-[#E2E8F0] bg-white text-[14px] font-semibold text-[#334155] transition-colors hover:bg-[#F8FAFC] disabled:opacity-40"
                >
                  &lsaquo;
                </button>
                {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => (
                  <button
                    key={i + 1}
                    onClick={() => setPage(i + 1)}
                    className={`flex h-10 w-10 items-center justify-center rounded-full text-[14px] font-semibold transition-colors ${
                      page === i + 1
                        ? "border border-[#3B82F6] bg-[#3B82F6] text-white"
                        : "border border-[#E2E8F0] bg-white text-[#334155] hover:bg-[#F8FAFC]"
                    }`}
                  >
                    {i + 1}
                  </button>
                ))}
                <button
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                  className="flex h-10 w-10 items-center justify-center rounded-full border border-[#E2E8F0] bg-white text-[14px] font-semibold text-[#334155] transition-colors hover:bg-[#F8FAFC] disabled:opacity-40"
                >
                  &rsaquo;
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Mobile filter BottomSheet */}
        <BottomSheet
          isOpen={mobileFiltersOpen}
          onClose={() => setMobileFiltersOpen(false)}
          title="ფილტრები"
        >
          <FilterPanel filters={filters} onFilterChange={setFilters} />
          <Button
            className="mt-4 w-full bg-brand-accent text-white hover:bg-brand-accent-hover"
            onClick={() => setMobileFiltersOpen(false)}
          >
            შედეგების ნახვა
          </Button>
        </BottomSheet>
      </div>
    </div>
  );
}
