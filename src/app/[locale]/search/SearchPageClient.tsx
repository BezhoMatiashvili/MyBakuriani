"use client";

import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { SlidersHorizontal } from "lucide-react";
import { useTranslations } from "next-intl";
import type { Tables } from "@/lib/types/database";
import PropertyCard from "@/components/cards/PropertyCard";
import { readPaymentOptions } from "@/lib/constants/sale-listing";
import ServiceCard from "@/components/cards/ServiceCard";
import {
  FilterPanel,
  DEFAULT_FILTERS,
  type Filters,
} from "@/components/search/FilterPanel";
import {
  SearchBox,
  type ActiveDropdown,
  type SearchFilters,
} from "@/components/search/SearchBox";
import { useActiveZones } from "@/lib/zones/client";
import { RentBuyToggle } from "@/components/search/RentBuyToggle";
import StatusCards from "@/components/landing/StatusCards";
import type { StatusCard } from "@/lib/status-cards/types";
import BottomSheet from "@/components/shared/BottomSheet";
import ScrollReveal from "@/components/shared/ScrollReveal";
import { SkierLoader } from "@/components/shared/SkierLoader";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import BannerSlot from "@/components/banners/BannerSlot";
import {
  RENT_PRICE_MAX,
  RENT_PRICE_MIN,
  buildRentSearchParams,
  normalizeRentFilters,
  parseRentSearchParams,
  type RentAdvancedFilters,
} from "@/lib/search/rentSearchQuery";

const ITEMS_PER_PAGE = 12;

type ServiceRow = Tables<"services"> & { has_whatsapp?: boolean };
type BlogRow = Tables<"blog_posts">;
type ActiveTab = "all" | "properties" | "services" | "blog";

interface Props {
  initialProperties: Tables<"properties">[];
  statusCards: StatusCard[];
  initialLocation?: string;
  initialCheckIn?: string;
  initialCheckOut?: string;
  initialGuests?: number | "";
  initialKeyword?: string;
  initialMode?: "rent" | "sale";
  initialFilters?: Filters;
}

interface SearchState {
  location: string;
  checkIn: string;
  checkOut: string;
  guests: number | "";
  keyword: string;
}

function filterPropertiesLocally(
  items: Tables<"properties">[],
  search: SearchState,
  currentFilters: Filters,
  currentMode: "rent" | "sale",
) {
  const locationQuery = search.location.trim().toLowerCase();
  const keywordQuery = search.keyword.trim().toLowerCase();

  return items.filter((property) => {
    const title = property.title.toLowerCase();
    const description = (property.description ?? "").toLowerCase();
    const location = (property.location ?? "").toLowerCase();
    const cadastralCode = (property.cadastral_code ?? "").toLowerCase();
    if (locationQuery && !title.includes(locationQuery) && !location.includes(locationQuery)) {
      return false;
    }
    if (
      keywordQuery &&
      !title.includes(keywordQuery) &&
      !description.includes(keywordQuery) &&
      !location.includes(keywordQuery) &&
      !cadastralCode.includes(keywordQuery)
    ) {
      return false;
    }
    if (currentMode === "sale" ? !property.is_for_sale : property.is_for_sale) {
      return false;
    }

    const price = Number(
      currentMode === "sale" ? property.sale_price : property.price_per_night,
    );
    if (
      currentFilters.priceMin !== "" &&
      (!Number.isFinite(price) || price < currentFilters.priceMin)
    ) {
      return false;
    }
    if (
      currentFilters.priceMax !== "" &&
      (!Number.isFinite(price) || price > currentFilters.priceMax)
    ) {
      return false;
    }
    if (
      currentFilters.rooms !== null &&
      (property.rooms ?? 0) < currentFilters.rooms
    ) {
      return false;
    }
    if (
      currentFilters.bathrooms !== null &&
      (property.bathrooms ?? 0) < currentFilters.bathrooms
    ) {
      return false;
    }
    if (search.guests !== "" && (property.capacity ?? 0) < search.guests) {
      return false;
    }
    if (
      currentFilters.areaMin !== "" &&
      (property.area_sqm ?? 0) < currentFilters.areaMin
    ) {
      return false;
    }
    if (
      currentFilters.areaMax !== "" &&
      (property.area_sqm ?? Number.POSITIVE_INFINITY) > currentFilters.areaMax
    ) {
      return false;
    }
    if (
      currentFilters.types.length > 0 &&
      !currentFilters.types.includes(property.type)
    ) {
      return false;
    }

    const amenities = Array.isArray(property.amenities)
      ? property.amenities.filter(
          (amenity): amenity is string => typeof amenity === "string",
        )
      : [];
    if (
      currentFilters.amenities.some(
        (amenity) => !amenities.includes(amenity),
      )
    ) {
      return false;
    }
    if (
      currentFilters.verifiedOnly &&
      (property as Tables<"properties"> & { profile_is_verified?: boolean })
        .profile_is_verified !== true
    ) {
      return false;
    }
    return true;
  });
}

export default function SearchPageClient({
  initialProperties,
  statusCards,
  initialLocation = "",
  initialCheckIn = "",
  initialCheckOut = "",
  initialGuests = "",
  initialKeyword = "",
  initialMode = "rent",
  initialFilters = DEFAULT_FILTERS,
}: Props) {
  const t = useTranslations("SearchPage");
  const tLanding = useTranslations("Landing");
  const [filters, setFilters] = useState<Filters>(initialFilters);
  const [searchState, setSearchState] = useState<SearchState>({
    location: initialLocation,
    checkIn: initialCheckIn,
    checkOut: initialCheckOut,
    guests: initialGuests,
    keyword: initialKeyword,
  });
  const [mode, setMode] = useState<"rent" | "sale">(initialMode);
  const [page, setPage] = useState(1);
  const [activeTab, setActiveTab] = useState<ActiveTab>("all");
  const [activeDropdown, setActiveDropdown] =
    useState<ActiveDropdown>(null);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [mobileFilterDraft, setMobileFilterDraft] = useState<Filters | null>(
    null,
  );

  // Property-only path state (used when no keyword)
  const [properties, setProperties] =
    useState<Tables<"properties">[]>(initialProperties);
  const [totalCount, setTotalCount] = useState(initialProperties.length);

  // Keyword path state — three buckets returned by global_search
  const [kwProperties, setKwProperties] = useState<Tables<"properties">[]>([]);
  const [kwServices, setKwServices] = useState<ServiceRow[]>([]);
  const [kwBlog, setKwBlog] = useState<BlogRow[]>([]);

  const [loading, setLoading] = useState(false);
  const isInitialMount = useRef(true);
  const isFirstUrlSync = useRef(true);
  const hasObservedUrl = useRef(false);
  const skipNextUrlWrite = useRef(false);
  const lastWrittenQuery = useRef<string | null>(null);
  const dropdownPortalRef = useRef<HTMLDivElement>(null);
  const dropdownBoundaryRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const urlSearchParams = useSearchParams();
  const urlQuery = urlSearchParams.toString();
  const { zones } = useActiveZones();

  const hasKeyword = searchState.keyword.trim().length > 0;

  const searchBoxAdvancedFilters = useMemo<RentAdvancedFilters>(
    () =>
      normalizeRentFilters({
        priceMin:
          filters.priceMin === "" ? RENT_PRICE_MIN : filters.priceMin,
        priceMax:
          filters.priceMax === "" ? RENT_PRICE_MAX : filters.priceMax,
        bedrooms: filters.rooms,
        bathrooms: filters.bathrooms,
        capacity:
          searchState.guests === "" ? null : Number(searchState.guests),
        amenities: filters.amenities,
        verifiedOnly: filters.verifiedOnly,
      }),
    [filters, searchState.guests],
  );

  const runSearch = useCallback(
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
        const keyword = search.keyword.trim();

        const body: Record<string, unknown> = {
          page: currentPage,
          per_page: ITEMS_PER_PAGE,
        };

        if (keyword) body.q = keyword;
        if (search.location) body.query = search.location;
        if (search.checkIn) body.check_in = search.checkIn;
        if (search.checkOut) body.check_out = search.checkOut;
        if (search.guests) body.capacity = search.guests;

        body.is_for_sale = currentMode === "sale";

        if (currentFilters.priceMin !== "")
          body.price_min = currentFilters.priceMin;
        if (currentFilters.priceMax !== "")
          body.price_max = currentFilters.priceMax;
        if (currentFilters.rooms !== null) body.rooms = currentFilters.rooms;
        if (currentFilters.bathrooms !== null)
          body.bathrooms = currentFilters.bathrooms;
        if (currentFilters.types.length === 1)
          body.property_type = currentFilters.types[0];
        if (currentFilters.types.length > 1)
          body.property_types = currentFilters.types;
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

        if (!response.ok) throw new Error("Search request failed");
        const result = await response.json();

        if (keyword) {
          // Bucketed response from global_search RPC
          const data = result.data as {
            properties?: Tables<"properties">[];
            services?: ServiceRow[];
            blog?: BlogRow[];
          };
          setKwProperties(data?.properties ?? []);
          setKwServices(data?.services ?? []);
          setKwBlog(data?.blog ?? []);
          setProperties([]);
          setTotalCount(0);
        } else {
          let data: Tables<"properties">[] = result.data || [];
          if (currentFilters.types.length > 1) {
            data = data.filter((p) => currentFilters.types.includes(p.type));
          }
          setProperties(data);
          setTotalCount(result.total ?? data.length);
          setKwProperties([]);
          setKwServices([]);
          setKwBlog([]);
        }
      } catch {
        // Fallback: client-side filter the initial property data so the page
        // never appears empty if the edge function is unreachable.
        const filtered = filterPropertiesLocally(
          initialProperties,
          search,
          currentFilters,
          currentMode,
        );
        if (search.keyword.trim()) {
          setKwProperties(filtered);
          setKwServices([]);
          setKwBlog([]);
          setProperties([]);
          setTotalCount(0);
        } else {
          setProperties(filtered);
          setTotalCount(filtered.length);
        }
      } finally {
        setLoading(false);
      }
    },
    [initialProperties],
  );

  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      const needFetch =
        !!searchState.keyword ||
        !!searchState.checkIn ||
        !!searchState.checkOut ||
        !!searchState.guests ||
        filters.priceMin !== "" ||
        filters.priceMax !== "" ||
        filters.rooms !== null ||
        filters.bathrooms !== null ||
        filters.areaMin !== "" ||
        filters.areaMax !== "" ||
        filters.types.length > 0 ||
        filters.amenities.length > 0 ||
        filters.verifiedOnly;
      if (!needFetch) return;
    }
    runSearch(searchState, filters, mode, page);
  }, [filters, mode, page, runSearch, searchState]);

  useEffect(() => {
    if (isFirstUrlSync.current) {
      isFirstUrlSync.current = false;
      return;
    }
    if (skipNextUrlWrite.current) {
      skipNextUrlWrite.current = false;
      return;
    }
    const params = buildRentSearchParams(
      {
        ...searchState,
        advancedFilters: searchBoxAdvancedFilters,
      },
      mode,
    );
    if (filters.areaMin !== "") params.set("area_min", String(filters.areaMin));
    if (filters.areaMax !== "") params.set("area_max", String(filters.areaMax));
    if (filters.types.length > 0) params.set("types", filters.types.join(","));
    lastWrittenQuery.current = params.toString();
    router.replace(`/search?${params.toString()}`, { scroll: false });
  }, [searchState, mode, filters, router, searchBoxAdvancedFilters]);

  useEffect(() => {
    if (!hasObservedUrl.current) {
      hasObservedUrl.current = true;
      return;
    }
    if (lastWrittenQuery.current === urlQuery) {
      lastWrittenQuery.current = null;
      return;
    }

    const observedParams = new URLSearchParams(urlQuery);
    const parsed = parseRentSearchParams(observedParams);
    const advanced = parsed.values.advancedFilters;
    const parseOptionalNumber = (key: string): number | "" => {
      const raw = observedParams.get(key);
      if (!raw) return "";
      const value = Number(raw);
      return Number.isFinite(value) ? value : "";
    };

    skipNextUrlWrite.current = true;
    setMode(parsed.mode);
    setSearchState({
      location: parsed.values.location,
      checkIn: parsed.values.checkIn,
      checkOut: parsed.values.checkOut,
      guests: parsed.values.guests,
      keyword: parsed.values.keyword,
    });
    setFilters({
      priceMin:
        advanced.priceMin === RENT_PRICE_MIN ? "" : advanced.priceMin,
      priceMax:
        advanced.priceMax === RENT_PRICE_MAX ? "" : advanced.priceMax,
      rooms: advanced.bedrooms,
      bathrooms: advanced.bathrooms,
      areaMin: parseOptionalNumber("area_min"),
      areaMax: parseOptionalNumber("area_max"),
      types: (observedParams.get("types") ?? "")
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean),
      amenities: advanced.amenities,
      verifiedOnly: advanced.verifiedOnly,
    });
    setPage(1);
    setActiveTab("all");
  }, [urlQuery]);

  const handleSearch = useCallback((sf: SearchFilters) => {
    const adv = sf.advancedFilters;
    setFilters((prev) => ({
      ...prev,
      priceMin: adv.priceMin === RENT_PRICE_MIN ? "" : adv.priceMin,
      priceMax: adv.priceMax === RENT_PRICE_MAX ? "" : adv.priceMax,
      rooms: adv.bedrooms,
      bathrooms: adv.bathrooms,
      amenities: adv.amenities,
      verifiedOnly: adv.verifiedOnly,
    }));
    setSearchState({
      location: sf.location,
      checkIn: sf.checkIn,
      checkOut: sf.checkOut,
      guests: sf.guests,
      keyword: sf.keyword,
    });
    setPage(1);
    setActiveTab("all");
  }, []);

  const handleModeChange = useCallback((newMode: "rent" | "sale") => {
    setMode(newMode);
    setPage(1);
  }, []);

  const totalPages = Math.ceil(totalCount / ITEMS_PER_PAGE);

  const tabCounts = useMemo(
    () => ({
      properties: kwProperties.length,
      services: kwServices.length,
      blog: kwBlog.length,
      all: kwProperties.length + kwServices.length + kwBlog.length,
    }),
    [kwProperties.length, kwServices.length, kwBlog.length],
  );

  return (
    <div className="flex min-h-screen flex-col bg-[#F8FAFC]">
      <section
        data-testid="listing-hero"
        className={cn(
          "relative flex items-start justify-center px-4 pb-14 pt-10 lg:overflow-visible lg:pb-0 lg:pt-16",
          activeDropdown ? "overflow-visible" : "overflow-hidden",
        )}
        style={{
          background:
            "linear-gradient(90deg, #101A33 -4.88%, #0E2150 51.09%, #1E419A 119.49%)",
        }}
      >
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage:
              "url('https://images.unsplash.com/photo-1483728642387-6c3bdd6c93e5?w=1600&h=600&fit=crop&q=30')",
            backgroundSize: "cover",
            backgroundPosition: "center bottom",
            mixBlendMode: "overlay",
          }}
        />

        <div className="relative z-10 mx-auto w-full max-w-[1160px] text-center">
          <ScrollReveal>
            <h1 className="text-2xl font-black leading-[1.15] tracking-[-0.7px] text-white sm:text-[32px] lg:text-[50px] lg:leading-[50px] lg:tracking-[-1.25px]">
              {tLanding("trustedGuide")}{" "}
              <span className="text-[#38BDF8]">
                {tLanding("inBakuriani")}
              </span>
            </h1>
          </ScrollReveal>

          {!hasKeyword && (
            <div className="mt-6 flex justify-center">
              <RentBuyToggle value={mode} onChange={handleModeChange} />
            </div>
          )}

          <div className="relative mt-6" data-testid="search-overlay-container">
            <SearchBox
              onSearch={handleSearch}
              className="shadow-[var(--shadow-search)]"
              defaultLocation={searchState.location}
              defaultGuests={searchState.guests}
              defaultKeyword={searchState.keyword}
              defaultCheckIn={searchState.checkIn}
              defaultCheckOut={searchState.checkOut}
              dropdownPortalRef={dropdownPortalRef}
              dropdownBoundaryRef={dropdownBoundaryRef}
              onActiveDropdownChange={setActiveDropdown}
              zones={zones}
              advancedFilters={searchBoxAdvancedFilters}
            />

            {activeDropdown === "filters" ? (
              <div
                ref={dropdownBoundaryRef}
                onMouseDown={(event) => event.stopPropagation()}
                className="absolute left-0 top-full z-30 mt-2 hidden w-[700px] max-w-full overflow-hidden rounded-3xl border border-[#E2E8F0] bg-white shadow-[0px_25px_50px_-12px_rgba(0,0,0,0.25)] lg:block"
              >
                <div ref={dropdownPortalRef} className="min-w-0" />
              </div>
            ) : activeDropdown === "calendar" ? (
              <div
                ref={dropdownBoundaryRef}
                onMouseDown={(event) => event.stopPropagation()}
                className="absolute left-0 top-full z-30 mt-2 hidden w-[760px] max-w-full lg:block"
              >
                <div ref={dropdownPortalRef} className="min-w-0" />
              </div>
            ) : null}
          </div>

          <div data-testid="search-status-cards">
            <StatusCards
              cards={statusCards}
              className="mt-8 sm:-mb-[42px]"
            />
          </div>
        </div>
      </section>

      <section
        data-testid="listing-results"
        className="mx-auto w-full max-w-7xl px-4 py-12 lg:py-16"
      >
        <div className="flex gap-8">
          {/* Filter sidebar — only meaningful without a keyword */}
          {!hasKeyword && (
            <aside className="hidden w-[280px] shrink-0 lg:block">
              <div
                className="sticky top-[190px]"
                data-testid="search-filter-sidebar"
              >
                <h2 className="mb-4 text-[10px] font-bold uppercase tracking-[1px] text-[#94A3B8]">
                  {t("filters")}
                </h2>
                <FilterPanel filters={filters} onFilterChange={setFilters} />
              </div>
            </aside>
          )}

          <div className="min-w-0 flex-1">
            {!hasKeyword && (
              <div className="mb-4 flex items-center justify-between lg:hidden">
                <span className="text-[13px] font-medium leading-[20px] text-[#64748B]">
                  {t("resultsCount", { count: totalCount })}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setMobileFilterDraft({
                      ...filters,
                      types: [...filters.types],
                      amenities: [...filters.amenities],
                    });
                    setMobileFiltersOpen(true);
                  }}
                  className="min-h-11 gap-2 lg:min-h-0"
                  data-testid="search-results-mobile-filters"
                >
                  <SlidersHorizontal className="h-4 w-4" />
                  {t("filters")}
                </Button>
              </div>
            )}

            {/* Heading */}
            {hasKeyword ? (
              <div className="mb-6">
                <h1 className="text-[26px] font-black leading-[32px] text-[#1E293B]">
                  {t("resultsFor", { keyword: searchState.keyword })}
                </h1>
                <p className="mt-1 text-[13px] font-medium leading-[20px] text-[#64748B]">
                  {t("foundAcrossSections", { count: tabCounts.all })}
                </p>
              </div>
            ) : (
              <div className="mb-6 hidden items-center justify-between lg:flex">
                <div>
                  <h1 className="text-[26px] font-black leading-[32px] text-[#1E293B]">
                    {mode === "sale"
                      ? t("foundObjects", { count: totalCount })
                      : searchState.location
                        ? t("foundOffersAt", {
                            count: totalCount,
                            location: searchState.location,
                          })
                        : t("foundOffers", { count: totalCount })}
                  </h1>
                  <p className="mt-1 text-[13px] font-medium leading-[20px] text-[#64748B]">
                    {t("bestStaySubtitle")}
                  </p>
                </div>
              </div>
            )}

            {/* Tabs (keyword mode only) */}
            {hasKeyword && (
              <div className="mb-6 flex flex-wrap gap-2 border-b border-[#E2E8F0]">
                {(
                  [
                    { id: "all", label: t("tabAll"), count: tabCounts.all },
                    {
                      id: "properties",
                      label: t("tabProperties"),
                      count: tabCounts.properties,
                    },
                    {
                      id: "services",
                      label: t("tabServices"),
                      count: tabCounts.services,
                    },
                    { id: "blog", label: t("tabBlog"), count: tabCounts.blog },
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id)}
                    className={cn(
                      "relative -mb-px px-4 py-3 text-[14px] font-semibold transition-colors",
                      activeTab === tab.id
                        ? "border-b-2 border-[#2563EB] text-[#2563EB]"
                        : "border-b-2 border-transparent text-[#64748B] hover:text-[#1E293B]",
                    )}
                  >
                    {tab.label}{" "}
                    <span
                      className={cn(
                        "ml-1 rounded-full px-2 py-0.5 text-[11px] font-bold",
                        activeTab === tab.id
                          ? "bg-[#DBEAFE] text-[#2563EB]"
                          : "bg-[#F1F5F9] text-[#64748B]",
                      )}
                    >
                      {tab.count}
                    </span>
                  </button>
                ))}
              </div>
            )}

            {loading && <SkierLoader variant="inline" />}

            {/* Empty state */}
            {!loading && hasKeyword && tabCounts.all === 0 && <EmptyState />}
            {!loading && !hasKeyword && properties.length === 0 && (
              <EmptyState />
            )}

            {/* Property-only path (no keyword) */}
            {!loading && !hasKeyword && properties.length > 0 && (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:gap-6 xl:grid-cols-3">
                <BannerSlot
                  placement="listing_top"
                  bare
                  className="col-span-full"
                />
                <BannerSlot placement="listing_grid" bare />

                {properties.map((p, i) => (
                  <ScrollReveal key={p.id} delay={i * 0.05}>
                    <PropertyCard
                      id={p.id}
                      createdAt={p.created_at}
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
                      discountExpiresAt={p.discount_expires_at}
                      isForSale={p.is_for_sale ?? false}
                      paymentOptions={readPaymentOptions(p.house_rules)}
                    />
                  </ScrollReveal>
                ))}
              </div>
            )}

            {/* Keyword path: tab-specific rendering */}
            {!loading && hasKeyword && tabCounts.all > 0 && (
              <KeywordResults
                activeTab={activeTab}
                onTabChange={setActiveTab}
                propertiesArr={kwProperties}
                servicesArr={kwServices}
                blogArr={kwBlog}
              />
            )}

            {/* Pagination (only property-only path) */}
            {!hasKeyword && totalPages > 1 && (
              <div className="mt-10 flex flex-wrap items-center justify-center gap-2">
                <button
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                  className="flex size-11 items-center justify-center rounded-full border border-[#E2E8F0] bg-white text-[14px] font-semibold text-[#334155] transition-colors hover:bg-[#F8FAFC] disabled:opacity-40 lg:size-10"
                >
                  &lsaquo;
                </button>
                {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => (
                  <button
                    key={i + 1}
                    onClick={() => setPage(i + 1)}
                    className={`flex size-11 items-center justify-center rounded-full text-[14px] font-semibold transition-colors lg:size-10 ${
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
                  className="flex size-11 items-center justify-center rounded-full border border-[#E2E8F0] bg-white text-[14px] font-semibold text-[#334155] transition-colors hover:bg-[#F8FAFC] disabled:opacity-40 lg:size-10"
                >
                  &rsaquo;
                </button>
              </div>
            )}
          </div>
        </div>

        <BottomSheet
          isOpen={mobileFiltersOpen}
          onClose={() => {
            setMobileFiltersOpen(false);
            setMobileFilterDraft(null);
          }}
          title={t("filters")}
          contentClassName="p-4 sm:p-5"
          footer={
            mobileFilterDraft ? (
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  className="min-h-11 flex-1"
                  onClick={() =>
                    setMobileFilterDraft({
                      ...DEFAULT_FILTERS,
                      types: [],
                      amenities: [],
                    })
                  }
                  data-testid="results-mobile-filter-reset"
                >
                  {t("resetFilters")}
                </Button>
                <Button
                  className="min-h-11 flex-[1.4] bg-brand-accent text-white hover:bg-brand-accent-hover"
                  onClick={() => {
                    setFilters(mobileFilterDraft);
                    setMobileFiltersOpen(false);
                    setMobileFilterDraft(null);
                  }}
                  data-testid="results-mobile-filter-apply"
                >
                  {t("viewResults")}
                </Button>
              </div>
            ) : undefined
          }
        >
          {mobileFilterDraft && (
            <FilterPanel
              filters={mobileFilterDraft}
              onFilterChange={setMobileFilterDraft}
              variant="sheet"
            />
          )}
        </BottomSheet>
      </section>
    </div>
  );
}

function EmptyState() {
  const t = useTranslations("SearchPage");
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <p className="text-[17px] font-black leading-[21px] text-[#1E293B]">
        {t("emptyTitle")}
      </p>
      <p className="mt-2 text-[13px] leading-[20px] text-[#64748B]">
        {t("emptyHint")}
      </p>
    </div>
  );
}

function KeywordResults({
  activeTab,
  onTabChange,
  propertiesArr,
  servicesArr,
  blogArr,
}: {
  activeTab: ActiveTab;
  onTabChange: (t: ActiveTab) => void;
  propertiesArr: Tables<"properties">[];
  servicesArr: ServiceRow[];
  blogArr: BlogRow[];
}) {
  const t = useTranslations("SearchPage");
  if (activeTab === "properties") {
    return <PropertiesGrid items={propertiesArr} />;
  }
  if (activeTab === "services") {
    return <ServicesGrid items={servicesArr} />;
  }
  if (activeTab === "blog") {
    return <BlogGrid items={blogArr} />;
  }
  // "all"
  return (
    <div className="flex flex-col gap-10">
      {propertiesArr.length > 0 && (
        <Section
          title={t("tabProperties")}
          count={propertiesArr.length}
          onSeeAll={() => onTabChange("properties")}
        >
          <PropertiesGrid items={propertiesArr.slice(0, 6)} />
        </Section>
      )}
      {servicesArr.length > 0 && (
        <Section
          title={t("tabServices")}
          count={servicesArr.length}
          onSeeAll={() => onTabChange("services")}
        >
          <ServicesGrid items={servicesArr.slice(0, 6)} />
        </Section>
      )}
      {blogArr.length > 0 && (
        <Section
          title={t("tabBlog")}
          count={blogArr.length}
          onSeeAll={() => onTabChange("blog")}
        >
          <BlogGrid items={blogArr.slice(0, 4)} />
        </Section>
      )}
    </div>
  );
}

function Section({
  title,
  count,
  onSeeAll,
  children,
}: {
  title: string;
  count: number;
  onSeeAll: () => void;
  children: React.ReactNode;
}) {
  const t = useTranslations("SearchPage");
  return (
    <section>
      <div className="mb-4 flex items-end justify-between">
        <h2 className="text-[18px] font-black text-[#1E293B]">
          {title}{" "}
          <span className="ml-1 text-[13px] font-semibold text-[#64748B]">
            ({count})
          </span>
        </h2>
        {count > 6 && (
          <button
            type="button"
            onClick={onSeeAll}
            className="text-[13px] font-bold text-[#2563EB] hover:underline"
          >
            {t("seeAll")}
          </button>
        )}
      </div>
      {children}
    </section>
  );
}

function PropertiesGrid({ items }: { items: Tables<"properties">[] }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:gap-6 xl:grid-cols-3">
      {items.map((p, i) => (
        <ScrollReveal key={p.id} delay={i * 0.05}>
          <PropertyCard
            id={p.id}
            createdAt={p.created_at}
            title={p.title}
            location={p.location}
            photos={p.photos ?? []}
            pricePerNight={p.price_per_night ? Number(p.price_per_night) : null}
            salePrice={p.sale_price ? Number(p.sale_price) : null}
            rating={null}
            capacity={p.capacity}
            rooms={p.rooms}
            isVip={p.is_vip ?? false}
            isSuperVip={p.is_super_vip ?? false}
            discountPercent={p.discount_percent ?? 0}
            discountExpiresAt={p.discount_expires_at}
            isForSale={p.is_for_sale ?? false}
            paymentOptions={readPaymentOptions(p.house_rules)}
          />
        </ScrollReveal>
      ))}
    </div>
  );
}

function ServicesGrid({ items }: { items: ServiceRow[] }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:gap-6 xl:grid-cols-3">
      {items.map((s, i) => (
        <ScrollReveal key={s.id} delay={i * 0.05}>
          <ServiceCard
            id={s.id}
            createdAt={s.created_at}
            title={s.title}
            category={s.category}
            location={s.location}
            photos={s.photos ?? []}
            price={s.price ? Number(s.price) : null}
            priceUnit={s.price_unit}
            discountPercent={s.discount_percent ?? 0}
            discountExpiresAt={s.discount_expires_at}
            isVip={s.is_vip ?? false}
            schedule={s.schedule}
            operatingHours={s.operating_hours}
            phone={null}
            hasWhatsapp={s.has_whatsapp ?? false}
            driverName={s.driver_name}
            vehicleCapacity={s.vehicle_capacity}
            vehicleMake={s.vehicle_make}
            transportType={s.transport_type}
            vehicleColor={s.vehicle_color}
            features={s.features}
            route={s.route}
            routes={s.routes}
            description={s.description}
          />
        </ScrollReveal>
      ))}
    </div>
  );
}

function BlogGrid({ items }: { items: BlogRow[] }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:gap-6">
      {items.map((post, i) => (
        <ScrollReveal key={post.id} delay={i * 0.05}>
          <Link
            href={`/blog/${post.slug}`}
            className="group block overflow-hidden rounded-2xl border border-[#E2E8F0] bg-white transition-shadow hover:shadow-lg"
          >
            {post.image_url ? (
              <div className="relative h-48 w-full">
                <Image
                  src={post.image_url}
                  alt={post.title}
                  fill
                  className="object-cover transition-transform group-hover:scale-105"
                  sizes="(min-width: 640px) 50vw, 100vw"
                />
              </div>
            ) : (
              <div className="h-48 w-full bg-gradient-to-br from-[#DBEAFE] to-[#F1F5F9]" />
            )}
            <div className="p-5">
              <h3 className="line-clamp-2 text-[16px] font-black text-[#1E293B]">
                {post.title}
              </h3>
              {post.excerpt && (
                <p className="mt-2 line-clamp-3 text-[13px] leading-5 text-[#64748B]">
                  {post.excerpt}
                </p>
              )}
            </div>
          </Link>
        </ScrollReveal>
      ))}
    </div>
  );
}
