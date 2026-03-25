"use client";

import { useEffect, useState, useCallback } from "react";
import { motion } from "framer-motion";
import {
  TrendingUp,
  Building2,
  BarChart3,
  SlidersHorizontal,
  ArrowUpDown,
} from "lucide-react";
import { useProperties } from "@/lib/hooks/useProperties";
import PropertyCard from "@/components/cards/PropertyCard";
import SkeletonCard from "@/components/cards/SkeletonCard";
import BottomSheet from "@/components/shared/BottomSheet";
import { staggerChildren, slideUp } from "@/lib/utils/animations";

const ITEMS_PER_PAGE = 12;

type SortKey = "newest" | "price_asc" | "price_desc" | "roi";

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "newest", label: "უახლესი" },
  { value: "price_asc", label: "ფასი: ზრდადი" },
  { value: "price_desc", label: "ფასი: კლებადი" },
  { value: "roi", label: "ROI: მაღალი" },
];

const INVESTMENT_STATS = [
  {
    icon: <TrendingUp className="size-6 text-green-600" />,
    label: "საშუალო ROI",
    value: "12-18%",
  },
  {
    icon: <Building2 className="size-6 text-blue-600" />,
    label: "აქტიური პროექტები",
    value: "15+",
  },
  {
    icon: <BarChart3 className="size-6 text-purple-600" />,
    label: "ფასის ზრდა",
    value: "+25%/წ",
  },
];

interface SalesFilters {
  priceMin: number | "";
  priceMax: number | "";
  constructionStatus: string;
}

const defaultFilters: SalesFilters = {
  priceMin: "",
  priceMax: "",
  constructionStatus: "",
};

export default function SalesPage() {
  const { properties, loading, list } = useProperties();
  const [filters, setFilters] = useState<SalesFilters>(defaultFilters);
  const [sortBy, setSortBy] = useState<SortKey>("newest");
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);

  const fetchProperties = useCallback(async () => {
    const result = await list(
      {
        isForSale: true,
        priceRange: {
          min: filters.priceMin !== "" ? filters.priceMin : undefined,
          max: filters.priceMax !== "" ? filters.priceMax : undefined,
        },
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
        return (a.sale_price ?? 0) - (b.sale_price ?? 0);
      case "price_desc":
        return (b.sale_price ?? 0) - (a.sale_price ?? 0);
      case "roi":
        return (b.roi_percent ?? 0) - (a.roi_percent ?? 0);
      default:
        return 0;
    }
  });

  const totalPages = Math.ceil(totalCount / ITEMS_PER_PAGE);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      {/* Investment Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-foreground sm:text-3xl">
          ინვესტიცია ბაკურიანში
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          ბაკურიანი — საქართველოს ყველაზე სწრაფად მზარდი კურორტი. შეიძინე უძრავი
          ქონება და მიიღე სტაბილური შემოსავალი გაქირავებიდან.
        </p>
      </div>

      {/* Market Stats */}
      <div className="mb-10 grid grid-cols-1 gap-4 sm:grid-cols-3">
        {INVESTMENT_STATS.map((stat) => (
          <div
            key={stat.label}
            className="flex items-center gap-4 rounded-xl bg-white p-5 shadow-sm"
          >
            <div className="flex size-12 items-center justify-center rounded-lg bg-muted/50">
              {stat.icon}
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{stat.value}</p>
              <p className="text-sm text-muted-foreground">{stat.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Filters bar */}
      <div className="mb-6 flex flex-wrap items-center gap-4">
        {/* Price range inputs */}
        <div className="hidden items-center gap-2 sm:flex">
          <input
            type="number"
            min={0}
            placeholder="მინ. ფასი"
            value={filters.priceMin}
            onChange={(e) =>
              setFilters((f) => ({
                ...f,
                priceMin: e.target.value ? Number(e.target.value) : "",
              }))
            }
            className="h-9 w-32 rounded-lg border border-border bg-background px-3 text-sm outline-none placeholder:text-muted-foreground focus:border-ring"
          />
          <span className="text-sm text-muted-foreground">–</span>
          <input
            type="number"
            min={0}
            placeholder="მაქს. ფასი"
            value={filters.priceMax}
            onChange={(e) =>
              setFilters((f) => ({
                ...f,
                priceMax: e.target.value ? Number(e.target.value) : "",
              }))
            }
            className="h-9 w-32 rounded-lg border border-border bg-background px-3 text-sm outline-none placeholder:text-muted-foreground focus:border-ring"
          />
          <span className="text-sm text-muted-foreground">₾</span>
        </div>

        {/* Mobile filter */}
        <button
          type="button"
          onClick={() => setFilterSheetOpen(true)}
          className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted sm:hidden"
        >
          <SlidersHorizontal className="size-4" />
          ფილტრი
        </button>

        {/* Sort */}
        <div className="ml-auto flex items-center gap-2">
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

      {/* Results count */}
      <p className="mb-4 text-sm text-muted-foreground">
        {totalCount > 0 ? `${totalCount} განცხადება` : "მოიძებნა 0 განცხადება"}
      </p>

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
              <div className="relative">
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
                {/* ROI overlay */}
                {p.roi_percent != null && (
                  <div className="absolute bottom-14 left-3 rounded-md bg-green-600 px-2 py-0.5 text-xs font-bold text-white">
                    ROI {p.roi_percent}%
                  </div>
                )}
                {/* Construction status */}
                {p.construction_status && (
                  <div className="absolute bottom-14 right-3 rounded-md bg-blue-600 px-2 py-0.5 text-xs font-medium text-white">
                    {p.construction_status}
                  </div>
                )}
              </div>
            </motion.div>
          ))}
        </motion.div>
      ) : (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <p className="text-lg font-medium text-muted-foreground">
            განცხადება არ მოიძებნა
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

      {/* Mobile filter BottomSheet */}
      <BottomSheet
        isOpen={filterSheetOpen}
        onClose={() => setFilterSheetOpen(false)}
        title="ფილტრი"
      >
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-foreground">
              ფასის დიაპაზონი
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={0}
                placeholder="მინ."
                value={filters.priceMin}
                onChange={(e) =>
                  setFilters((f) => ({
                    ...f,
                    priceMin: e.target.value ? Number(e.target.value) : "",
                  }))
                }
                className="h-9 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none placeholder:text-muted-foreground focus:border-ring"
              />
              <span className="text-sm text-muted-foreground">–</span>
              <input
                type="number"
                min={0}
                placeholder="მაქს."
                value={filters.priceMax}
                onChange={(e) =>
                  setFilters((f) => ({
                    ...f,
                    priceMax: e.target.value ? Number(e.target.value) : "",
                  }))
                }
                className="h-9 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none placeholder:text-muted-foreground focus:border-ring"
              />
              <span className="text-sm text-muted-foreground">₾</span>
            </div>
          </div>
        </div>
      </BottomSheet>
    </div>
  );
}
