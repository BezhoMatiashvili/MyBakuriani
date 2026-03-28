"use client";

import { useState, useMemo } from "react";
import { SlidersHorizontal, X, Briefcase } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import type { Tables } from "@/lib/types/database";
import ServiceCard from "@/components/cards/ServiceCard";
import ScrollReveal from "@/components/shared/ScrollReveal";
import { Button } from "@/components/ui/button";

interface Props {
  services: Tables<"services">[];
}

export default function EmploymentPageClient({ services }: Props) {
  const [priceMin, setPriceMin] = useState<number | "">("");
  const [priceMax, setPriceMax] = useState<number | "">("");
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

  const filtered = useMemo(() => {
    return services.filter((s) => {
      if (priceMin !== "" && (s.price ?? 0) < priceMin) return false;
      if (priceMax !== "" && (s.price ?? 0) > priceMax) return false;
      return true;
    });
  }, [services, priceMin, priceMax]);

  const clearFilters = () => {
    setPriceMin("");
    setPriceMax("");
  };

  const hasActiveFilters = priceMin !== "" || priceMax !== "";

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
              <Briefcase className="h-5 w-5" />
              <span className="text-sm">მთავარი / დასაქმება ბაკურიანში</span>
            </div>
            <h1 className="mt-4 text-3xl font-black text-white md:text-4xl">
              დასაქმება ბაკურიანში
            </h1>
            <p className="mt-2 text-[13px] font-medium text-white/70">
              {filtered.length} ვაკანსია ნაპოვნია
            </p>
          </ScrollReveal>
        </div>
      </section>

      {/* Content */}
      <section className="mx-auto w-full max-w-7xl flex-1 px-4 py-8">
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
              onClick={clearFilters}
              className="text-brand-error"
            >
              გასუფთავება
            </Button>
          )}
        </div>

        <div className="flex gap-8">
          {/* Sidebar */}
          <aside className="hidden w-[280px] shrink-0 lg:block">
            <div className="sticky top-24">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-black text-[#1E293B]">ფილტრები</h2>
                {hasActiveFilters && (
                  <button
                    onClick={clearFilters}
                    className="text-xs text-brand-error hover:underline"
                  >
                    გასუფთავება
                  </button>
                )}
              </div>
              <div className="rounded-3xl border border-[#F1F5F9] bg-white p-4">
                <h3 className="mb-2 text-sm font-medium">ანაზღაურება</h3>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={0}
                    placeholder="მინ."
                    value={priceMin}
                    onChange={(e) =>
                      setPriceMin(e.target.value ? Number(e.target.value) : "")
                    }
                    className="h-9 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/50"
                  />
                  <span className="text-sm text-muted-foreground">–</span>
                  <input
                    type="number"
                    min={0}
                    placeholder="მაქს."
                    value={priceMax}
                    onChange={(e) =>
                      setPriceMax(e.target.value ? Number(e.target.value) : "")
                    }
                    className="h-9 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/50"
                  />
                  <span className="text-sm text-muted-foreground">₾</span>
                </div>
              </div>
            </div>
          </aside>

          {/* Mobile filters */}
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
                    <h2 className="text-[17px] font-black leading-[21px] text-[#1E293B]">
                      ფილტრები
                    </h2>
                    <button
                      onClick={() => setMobileFiltersOpen(false)}
                      className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-muted"
                    >
                      <X className="h-5 w-5" />
                    </button>
                  </div>
                  <div className="rounded-3xl border border-[#F1F5F9] bg-white p-4">
                    <h3 className="mb-2 text-sm font-medium">ანაზღაურება</h3>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min={0}
                        placeholder="მინ."
                        value={priceMin}
                        onChange={(e) =>
                          setPriceMin(
                            e.target.value ? Number(e.target.value) : "",
                          )
                        }
                        className="h-9 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/50"
                      />
                      <span className="text-sm text-muted-foreground">–</span>
                      <input
                        type="number"
                        min={0}
                        placeholder="მაქს."
                        value={priceMax}
                        onChange={(e) =>
                          setPriceMax(
                            e.target.value ? Number(e.target.value) : "",
                          )
                        }
                        className="h-9 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/50"
                      />
                      <span className="text-sm text-muted-foreground">₾</span>
                    </div>
                  </div>
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
                  <Briefcase className="h-8 w-8 text-muted-foreground" />
                </div>
                <h3 className="text-[17px] font-black leading-[21px] text-[#1E293B]">
                  ვაკანსიები ვერ მოიძებნა
                </h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  სცადეთ ფილტრების შეცვლა
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {filtered.map((s, i) => (
                  <ScrollReveal key={s.id} delay={i * 0.05}>
                    <ServiceCard
                      id={s.id}
                      title={s.title}
                      category={s.category}
                      location={s.location}
                      photos={s.photos}
                      price={s.price}
                      priceUnit={s.price_unit}
                      discountPercent={s.discount_percent}
                      isVip={s.is_vip}
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
