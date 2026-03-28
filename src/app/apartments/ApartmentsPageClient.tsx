"use client";

import { useState, useMemo } from "react";
import { SlidersHorizontal, X, Home } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import type { Tables } from "@/lib/types/database";
import PropertyCard from "@/components/cards/PropertyCard";
import { FilterPanel, type Filters } from "@/components/search/FilterPanel";
import ScrollReveal from "@/components/shared/ScrollReveal";
import { Button } from "@/components/ui/button";

const INITIAL_FILTERS: Filters = {
  priceMin: "",
  priceMax: "",
  rooms: null,
  areaMin: "",
  areaMax: "",
  types: [],
  amenities: [],
};

interface Props {
  properties: Tables<"properties">[];
}

export default function ApartmentsPageClient({ properties }: Props) {
  const [filters, setFilters] = useState<Filters>(INITIAL_FILTERS);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

  const filtered = useMemo(() => {
    return properties.filter((p) => {
      if (
        filters.priceMin !== "" &&
        Number(p.price_per_night ?? 0) < Number(filters.priceMin)
      )
        return false;
      if (
        filters.priceMax !== "" &&
        Number(p.price_per_night ?? 0) > Number(filters.priceMax)
      )
        return false;
      if (filters.rooms !== null && (p.rooms ?? 0) < filters.rooms)
        return false;
      if (
        filters.areaMin !== "" &&
        Number(p.area_sqm ?? 0) < Number(filters.areaMin)
      )
        return false;
      if (
        filters.areaMax !== "" &&
        Number(p.area_sqm ?? 0) > Number(filters.areaMax)
      )
        return false;
      if (filters.types.length > 0 && !filters.types.includes(p.type))
        return false;
      // Amenities filter
      if (filters.amenities.length > 0) {
        const propertyAmenities = Array.isArray(p.amenities)
          ? (p.amenities as string[])
          : [];
        if (!filters.amenities.every((a) => propertyAmenities.includes(a)))
          return false;
      }
      return true;
    });
  }, [properties, filters]);

  const hasActiveFilters =
    filters.priceMin !== "" ||
    filters.priceMax !== "" ||
    filters.rooms !== null ||
    filters.areaMin !== "" ||
    filters.areaMax !== "" ||
    filters.types.length > 0 ||
    filters.amenities.length > 0;

  return (
    <div className="flex min-h-screen flex-col">
      {/* Header */}
      <section
        className="px-4 py-12 md:py-16"
        style={{
          background:
            "linear-gradient(90deg, #101A33 -4.88%, #0E2150 51.09%, #1E419A 119.49%)",
        }}
      >
        <div className="mx-auto max-w-7xl">
          <ScrollReveal>
            <div className="flex items-center gap-3 text-white/70">
              <Home className="h-5 w-5" />
              <span className="text-sm">
                მთავარი / აპარტამენტები და კოტეჯები
              </span>
            </div>
            <h1 className="mt-4 text-3xl font-black text-white md:text-4xl">
              აპარტამენტები და კოტეჯები
            </h1>
            <p className="mt-2 text-[13px] font-medium text-white/70">
              {filtered.length} განცხადება ნაპოვნია
            </p>
          </ScrollReveal>
        </div>
      </section>

      {/* Content */}
      <section className="mx-auto w-full max-w-7xl flex-1 px-4 py-8">
        {/* Mobile filter toggle */}
        <div className="mb-6 flex items-center justify-between lg:hidden">
          <Button
            variant="outline"
            onClick={() => setMobileFiltersOpen(true)}
            className="gap-2"
          >
            <SlidersHorizontal className="h-4 w-4" />
            ფილტრები
          </Button>
          {hasActiveFilters && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setFilters(INITIAL_FILTERS)}
              className="text-brand-error"
            >
              გასუფთავება
            </Button>
          )}
        </div>

        <div className="flex gap-8">
          {/* Sidebar — Desktop */}
          <aside className="hidden w-[280px] shrink-0 lg:block">
            <div className="sticky top-24">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-black text-[#1E293B]">ფილტრები</h2>
                {hasActiveFilters && (
                  <button
                    onClick={() => setFilters(INITIAL_FILTERS)}
                    className="text-xs text-brand-error hover:underline"
                  >
                    გასუფთავება
                  </button>
                )}
              </div>
              <FilterPanel filters={filters} onFilterChange={setFilters} />
            </div>
          </aside>

          {/* Mobile filters overlay */}
          <AnimatePresence>
            {mobileFiltersOpen && (
              <>
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="fixed inset-0 z-40 bg-black/50 lg:hidden"
                  onClick={() => setMobileFiltersOpen(false)}
                />
                <motion.div
                  initial={{ x: "-100%" }}
                  animate={{ x: 0 }}
                  exit={{ x: "-100%" }}
                  transition={{ type: "spring", damping: 25, stiffness: 300 }}
                  className="fixed inset-y-0 left-0 z-50 w-[320px] overflow-y-auto bg-background p-4 shadow-xl lg:hidden"
                >
                  <div className="mb-4 flex items-center justify-between">
                    <h2 className="text-lg font-black text-[#1E293B]">
                      ფილტრები
                    </h2>
                    <button
                      onClick={() => setMobileFiltersOpen(false)}
                      className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-muted"
                    >
                      <X className="h-5 w-5" />
                    </button>
                  </div>
                  <FilterPanel filters={filters} onFilterChange={setFilters} />
                  <Button
                    className="mt-4 w-full bg-brand-accent text-white hover:bg-brand-accent-hover"
                    onClick={() => setMobileFiltersOpen(false)}
                  >
                    ნახვა ({filtered.length})
                  </Button>
                </motion.div>
              </>
            )}
          </AnimatePresence>

          {/* Grid */}
          <div className="flex-1">
            {filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted">
                  <Home className="h-8 w-8 text-muted-foreground" />
                </div>
                <h3 className="text-lg font-black text-[#1E293B]">
                  განცხადებები ვერ მოიძებნა
                </h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  სცადეთ ფილტრების შეცვლა
                </p>
                {hasActiveFilters && (
                  <Button
                    variant="outline"
                    className="mt-4"
                    onClick={() => setFilters(INITIAL_FILTERS)}
                  >
                    ფილტრების გასუფთავება
                  </Button>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {filtered.map((p, i) => (
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
          </div>
        </div>
      </section>
    </div>
  );
}
