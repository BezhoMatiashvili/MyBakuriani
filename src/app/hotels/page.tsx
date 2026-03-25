"use client";

import { useEffect, useState, useCallback } from "react";
import { motion } from "framer-motion";
import { SlidersHorizontal, ArrowUpDown } from "lucide-react";
import { useProperties } from "@/lib/hooks/useProperties";
import PropertyCard from "@/components/cards/PropertyCard";
import SkeletonCard from "@/components/cards/SkeletonCard";
import { FilterPanel, type Filters } from "@/components/search/FilterPanel";
import BottomSheet from "@/components/shared/BottomSheet";
import { staggerChildren, slideUp } from "@/lib/utils/animations";

const ITEMS_PER_PAGE = 12;

type SortKey = "newest" | "price_asc" | "price_desc" | "rating";

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "newest", label: "უახლესი" },
  { value: "price_asc", label: "ფასი: ზრდადი" },
  { value: "price_desc", label: "ფასი: კლებადი" },
  { value: "rating", label: "რეიტინგი" },
];

const defaultFilters: Filters = {
  priceMin: "",
  priceMax: "",
  rooms: null,
  areaMin: "",
  areaMax: "",
  types: [],
  amenities: [],
};

export default function HotelsPage() {
  const { properties, loading, list } = useProperties();
  const [filters, setFilters] = useState<Filters>(defaultFilters);
  const [sortBy, setSortBy] = useState<SortKey>("newest");
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);

  const fetchProperties = useCallback(async () => {
    const result = await list(
      {
        type: "hotel",
        priceRange: {
          min: filters.priceMin !== "" ? filters.priceMin : undefined,
          max: filters.priceMax !== "" ? filters.priceMax : undefined,
        },
        rooms: filters.rooms ?? undefined,
        isForSale: false,
      },
      page,
      ITEMS_PER_PAGE,
    );
    setTotalCount(result.count ?? 0);
  }, [filters, page, list]);

  useEffect(() => {
    fetchProperties();
  }, [fetchProperties]);

  const sortedProperties = [...properties].sort((a, b) => {
    switch (sortBy) {
      case "price_asc":
        return (a.price_per_night ?? 0) - (b.price_per_night ?? 0);
      case "price_desc":
        return (b.price_per_night ?? 0) - (a.price_per_night ?? 0);
      default:
        return 0;
    }
  });

  const totalPages = Math.ceil(totalCount / ITEMS_PER_PAGE);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-foreground sm:text-3xl">
          სასტუმროები ბაკურიანში
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {totalCount > 0
            ? `${totalCount} განცხადება`
            : "მოიძებნა 0 განცხადება"}
        </p>
      </div>

      <div className="flex gap-8">
        {/* Sidebar filters — desktop */}
        <aside className="hidden w-72 shrink-0 lg:block">
          <FilterPanel filters={filters} onFilterChange={setFilters} />
        </aside>

        {/* Main content */}
        <div className="min-w-0 flex-1">
          {/* Toolbar */}
          <div className="mb-6 flex items-center justify-between">
            <button
              type="button"
              onClick={() => setFilterSheetOpen(true)}
              className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted lg:hidden"
            >
              <SlidersHorizontal className="size-4" />
              ფილტრი
            </button>

            <div className="flex items-center gap-2">
              <ArrowUpDown className="size-4 text-muted-foreground" />
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortKey)}
                className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-ring"
              >
                {SORT_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Grid */}
          {loading ? (
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <SkeletonCard key={i} />
              ))}
            </div>
          ) : sortedProperties.length > 0 ? (
            <motion.div
              variants={staggerChildren}
              initial="hidden"
              animate="visible"
              className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
            >
              {sortedProperties.map((p) => (
                <motion.div key={p.id} variants={slideUp}>
                  <PropertyCard
                    id={p.id}
                    title={p.title}
                    location={p.location}
                    photos={p.photos}
                    pricePerNight={p.price_per_night}
                    salePrice={p.sale_price}
                    rating={null}
                    capacity={p.capacity}
                    rooms={p.rooms}
                    isVip={p.is_vip}
                    isSuperVip={p.is_super_vip}
                    discountPercent={p.discount_percent}
                    isForSale={p.is_for_sale}
                  />
                </motion.div>
              ))}
            </motion.div>
          ) : (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <p className="text-lg font-medium text-muted-foreground">
                სასტუმრო არ მოიძებნა
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                სცადეთ ფილტრების შეცვლა
              </p>
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="mt-8 flex items-center justify-center gap-2">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="rounded-lg border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-muted disabled:opacity-50"
              >
                წინა
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter(
                  (p) => p === 1 || p === totalPages || Math.abs(p - page) <= 2,
                )
                .map((p, idx, arr) => (
                  <span key={p} className="flex items-center">
                    {idx > 0 && arr[idx - 1] !== p - 1 && (
                      <span className="px-1 text-muted-foreground">...</span>
                    )}
                    <button
                      type="button"
                      onClick={() => setPage(p)}
                      className={`flex h-9 min-w-[36px] items-center justify-center rounded-lg text-sm font-medium transition-colors ${
                        p === page
                          ? "bg-blue-600 text-white"
                          : "border border-border hover:bg-muted"
                      }`}
                    >
                      {p}
                    </button>
                  </span>
                ))}
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="rounded-lg border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-muted disabled:opacity-50"
              >
                შემდეგი
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Mobile filter BottomSheet */}
      <BottomSheet
        isOpen={filterSheetOpen}
        onClose={() => setFilterSheetOpen(false)}
        title="ფილტრი"
      >
        <FilterPanel filters={filters} onFilterChange={setFilters} />
      </BottomSheet>
    </div>
  );
}
