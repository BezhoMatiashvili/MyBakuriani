"use client";

import { useState } from "react";
import { SlidersHorizontal } from "lucide-react";
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

const MOCK_RESULTS = Array.from({ length: 12 }, (_, i) => ({
  id: `search-${i + 1}`,
  title: `აპარტამენტი #${i + 1} — ბაკურიანი`,
  location: "ბაკურიანი, დიდველი",
  photos: ["/placeholder-property.jpg"],
  pricePerNight: 100 + i * 20,
  salePrice: null,
  rating: 4.2 + (i % 8) * 0.1,
  capacity: 2 + (i % 6),
  rooms: 1 + (i % 4),
  isVip: i < 2,
  isSuperVip: i === 0,
  discountPercent: i === 2 ? 20 : i === 5 ? 10 : 0,
  isForSale: false,
}));

const ITEMS_PER_PAGE = 8;

export default function SearchPageClient() {
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [page, setPage] = useState(1);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

  const totalPages = Math.ceil(MOCK_RESULTS.length / ITEMS_PER_PAGE);
  const paginatedResults = MOCK_RESULTS.slice(
    (page - 1) * ITEMS_PER_PAGE,
    page * ITEMS_PER_PAGE,
  );

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      {/* Search bar */}
      <ScrollReveal>
        <SearchBox onSearch={() => setPage(1)} className="mb-8" />
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
              {MOCK_RESULTS.length} შედეგი
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
              {MOCK_RESULTS.length} შედეგი
            </span>
          </div>

          {/* Property grid */}
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-3">
            {paginatedResults.map((p, i) => (
              <ScrollReveal key={p.id} delay={i * 0.05}>
                <PropertyCard {...p} />
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
              {Array.from({ length: totalPages }, (_, i) => (
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
