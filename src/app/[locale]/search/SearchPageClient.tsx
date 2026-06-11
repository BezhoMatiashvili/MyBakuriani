"use client";

import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { SlidersHorizontal } from "lucide-react";
import { useTranslations } from "next-intl";
import type { Tables } from "@/lib/types/database";
import PropertyCard from "@/components/cards/PropertyCard";
import ServiceCard from "@/components/cards/ServiceCard";
import {
  FilterPanel,
  DEFAULT_FILTERS,
  type Filters,
} from "@/components/search/FilterPanel";
import { SearchBox, type SearchFilters } from "@/components/search/SearchBox";
import { useActiveZones } from "@/lib/zones/client";
import { RentBuyToggle } from "@/components/search/RentBuyToggle";
import BottomSheet from "@/components/shared/BottomSheet";
import ScrollReveal from "@/components/shared/ScrollReveal";
import { SkierLoader } from "@/components/shared/SkierLoader";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const ITEMS_PER_PAGE = 12;

type ServiceRow = Tables<"services">;
type BlogRow = Tables<"blog_posts">;
type ActiveTab = "all" | "properties" | "services" | "blog";

interface Props {
  initialProperties: Tables<"properties">[];
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

export default function SearchPageClient({
  initialProperties,
  initialLocation = "",
  initialCheckIn = "",
  initialCheckOut = "",
  initialGuests = "",
  initialKeyword = "",
  initialMode = "rent",
  initialFilters = DEFAULT_FILTERS,
}: Props) {
  const t = useTranslations("SearchPage");
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
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

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
  const router = useRouter();
  const { zones } = useActiveZones();

  const hasKeyword = searchState.keyword.trim().length > 0;

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
        if (search.keyword.trim()) {
          const q = search.keyword.trim().toLowerCase();
          const filtered = initialProperties.filter(
            (p) =>
              p.title.toLowerCase().includes(q) ||
              (p.description ?? "").toLowerCase().includes(q) ||
              (p.location ?? "").toLowerCase().includes(q) ||
              (p.cadastral_code ?? "").toLowerCase().includes(q),
          );
          setKwProperties(filtered);
          setKwServices([]);
          setKwBlog([]);
          setProperties([]);
          setTotalCount(0);
        } else {
          let filtered = initialProperties;
          if (search.location) {
            const q = search.location.toLowerCase();
            filtered = filtered.filter(
              (p) =>
                p.title.toLowerCase().includes(q) ||
                p.location?.toLowerCase().includes(q),
            );
          }
          filtered = filtered.filter((p) =>
            currentMode === "sale" ? p.is_for_sale : !p.is_for_sale,
          );
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
    const params = new URLSearchParams();
    if (searchState.location) params.set("location", searchState.location);
    if (searchState.checkIn) params.set("check_in", searchState.checkIn);
    if (searchState.checkOut) params.set("check_out", searchState.checkOut);
    if (searchState.guests) params.set("guests", String(searchState.guests));
    if (searchState.keyword) params.set("q", searchState.keyword);
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
    <div className="min-h-screen bg-[#F8FAFC]">
      <div className="mx-auto max-w-7xl px-4 py-8">
        <ScrollReveal>
          {!hasKeyword && (
            <div className="mb-4 flex justify-center">
              <RentBuyToggle value={mode} onChange={handleModeChange} />
            </div>
          )}
          <SearchBox
            onSearch={handleSearch}
            className="mb-8"
            defaultLocation={initialLocation}
            defaultGuests={initialGuests}
            defaultKeyword={initialKeyword}
            defaultCheckIn={initialCheckIn}
            defaultCheckOut={initialCheckOut}
            zones={zones}
          />
        </ScrollReveal>

        <div className="flex gap-8">
          {/* Filter sidebar — only meaningful without a keyword */}
          {!hasKeyword && (
            <aside className="hidden w-[280px] shrink-0 lg:block">
              <div className="sticky top-24">
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
                  onClick={() => setMobileFiltersOpen(true)}
                  className="gap-2"
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

        <BottomSheet
          isOpen={mobileFiltersOpen}
          onClose={() => setMobileFiltersOpen(false)}
          title={t("filters")}
        >
          <FilterPanel filters={filters} onFilterChange={setFilters} />
          <Button
            className="mt-4 w-full bg-brand-accent text-white hover:bg-brand-accent-hover"
            onClick={() => setMobileFiltersOpen(false)}
          >
            {t("viewResults")}
          </Button>
        </BottomSheet>
      </div>
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
    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-3">
      {items.map((p, i) => (
        <ScrollReveal key={p.id} delay={i * 0.05}>
          <PropertyCard
            id={p.id}
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
            isForSale={p.is_for_sale ?? false}
          />
        </ScrollReveal>
      ))}
    </div>
  );
}

function ServicesGrid({ items }: { items: ServiceRow[] }) {
  return (
    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-3">
      {items.map((s, i) => (
        <ScrollReveal key={s.id} delay={i * 0.05}>
          <ServiceCard
            id={s.id}
            title={s.title}
            category={s.category}
            location={s.location}
            photos={s.photos ?? []}
            price={s.price ? Number(s.price) : null}
            priceUnit={s.price_unit}
            discountPercent={s.discount_percent ?? 0}
            isVip={s.is_vip ?? false}
            schedule={s.schedule}
            operatingHours={s.operating_hours}
            phone={s.phone}
            driverName={s.driver_name}
            vehicleCapacity={s.vehicle_capacity}
            vehicleMake={s.vehicle_make}
            vehicleColor={s.vehicle_color}
            features={s.features}
            route={s.route}
            description={s.description}
          />
        </ScrollReveal>
      ))}
    </div>
  );
}

function BlogGrid({ items }: { items: BlogRow[] }) {
  return (
    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
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
