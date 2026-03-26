"use client";

import { useState, useMemo, useCallback } from "react";
import { SlidersHorizontal } from "lucide-react";
import type { Tables } from "@/lib/types/database";

interface SearchFilters {
  location: string;
  date: string;
  guests: number | "";
  cadastralCode: string;
}
import PropertyCard from "@/components/cards/PropertyCard";
import { FilterPanel, type Filters } from "@/components/search/FilterPanel";
import { SearchBox } from "@/components/search/SearchBox";
import BottomSheet from "@/components/shared/BottomSheet";
import ScrollReveal from "@/components/shared/ScrollReveal";
import { Button } from "@/components/ui/button";

const DEFAULT_FILTERS: Filters = {
  priceMin: "",
  priceMax: "",
  rooms: null,
  areaMin: "",
  areaMax: "",
  types: [],
  amenities: [],
};

const ITEMS_PER_PAGE = 12;

interface Props {
  initialProperties: Tables<"properties">[];
}

export default function SearchPageClient({ initialProperties }: Props) {
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [searchQuery, setSearchQuery] = useState("");
  const [guestFilter, setGuestFilter] = useState<number | "">();
  const [page, setPage] = useState(1);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

  const handleSearch = useCallback((sf: SearchFilters) => {
    const q = [sf.location, sf.cadastralCode].filter(Boolean).join(" ");
    setSearchQuery(q);
    if (sf.guests !== "") setGuestFilter(sf.guests);
    setPage(1);
  }, []);

  const filtered = useMemo(() => {
    return initialProperties.filter((p) => {
      // Text search
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const matchesTitle = p.title.toLowerCase().includes(q);
        const matchesLocation = p.location?.toLowerCase().includes(q);
        const matchesCadastral = p.cadastral_code?.toLowerCase().includes(q);
        if (!matchesTitle && !matchesLocation && !matchesCadastral)
          return false;
      }
      // Price filter
      const price = p.is_for_sale ? p.sale_price : p.price_per_night;
      if (filters.priceMin !== "" && (price ?? 0) < Number(filters.priceMin))
        return false;
      if (filters.priceMax !== "" && (price ?? 0) > Number(filters.priceMax))
        return false;
      // Rooms
      if (filters.rooms !== null && p.rooms !== filters.rooms) return false;
      // Area
      if (filters.areaMin !== "" && (p.area_sqm ?? 0) < Number(filters.areaMin))
        return false;
      if (filters.areaMax !== "" && (p.area_sqm ?? 0) > Number(filters.areaMax))
        return false;
      // Property type
      if (filters.types.length > 0 && !filters.types.includes(p.type))
        return false;
      // Guests
      if (guestFilter && p.capacity && p.capacity < guestFilter) return false;
      return true;
    });
  }, [initialProperties, filters, searchQuery, guestFilter]);

  const totalPages = Math.ceil(filtered.length / ITEMS_PER_PAGE);
  const paginatedResults = filtered.slice(
    (page - 1) * ITEMS_PER_PAGE,
    page * ITEMS_PER_PAGE,
  );

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      {/* Search bar */}
      <ScrollReveal>
        <SearchBox onSearch={handleSearch} className="mb-8" />
      </ScrollReveal>

      <div className="flex gap-8">
        {/* Desktop filter sidebar */}
        <aside className="hidden w-[280px] shrink-0 lg:block">
          <div className="sticky top-24">
            <h2 className="mb-4 text-lg font-semibold">ფილტრები</h2>
            <FilterPanel filters={filters} onFilterChange={setFilters} />
          </div>
        </aside>

        {/* Results area */}
        <div className="min-w-0 flex-1">
          {/* Mobile filter button */}
          <div className="mb-4 flex items-center justify-between lg:hidden">
            <span className="text-sm text-muted-foreground">
              {filtered.length} შედეგი
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
            <h1 className="text-xl font-bold">ძებნის შედეგები</h1>
            <span className="text-sm text-muted-foreground">
              {filtered.length} შედეგი
            </span>
          </div>

          {/* Empty state */}
          {paginatedResults.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <p className="text-lg font-semibold text-foreground">
                შედეგი ვერ მოიძებნა
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                სცადეთ სხვა საძიებო სიტყვა ან შეცვალეთ ფილტრები
              </p>
            </div>
          )}

          {/* Property grid */}
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-3">
            {paginatedResults.map((p, i) => (
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

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="mt-10 flex items-center justify-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                წინა
              </Button>
              {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => (
                <Button
                  key={i + 1}
                  variant={page === i + 1 ? "default" : "outline"}
                  size="sm"
                  onClick={() => setPage(i + 1)}
                  className={
                    page === i + 1
                      ? "bg-brand-accent text-white hover:bg-brand-accent-hover"
                      : ""
                  }
                >
                  {i + 1}
                </Button>
              ))}
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                შემდეგი
              </Button>
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
  );
}
