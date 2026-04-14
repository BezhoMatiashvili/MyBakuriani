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

  const filtered = useMemo(
    () =>
      services.filter((s) => {
        if (priceMin !== "" && (s.price ?? 0) < priceMin) return false;
        if (priceMax !== "" && (s.price ?? 0) > priceMax) return false;
        return true;
      }),
    [services, priceMin, priceMax],
  );

  const clearFilters = () => {
    setPriceMin("");
    setPriceMax("");
  };
  const hasActiveFilters = priceMin !== "" || priceMax !== "";

  return (
    <div className="flex min-h-screen flex-col bg-[#F8FAFC]">
      <section className="bg-gradient-to-b from-[#0E2150] to-[#1E3A7B] px-4 py-16 text-center">
        <div className="mx-auto max-w-3xl">
          <ScrollReveal>
            <h1 className="text-[36px] font-black leading-[44px] sm:text-[48px] sm:leading-[56px]">
              <span className="text-[#F97316]">დასაქმება</span>{" "}
              <span className="text-white">ბაკურიანში</span>
            </h1>
            <p className="mx-auto mt-4 max-w-xl text-[15px] leading-[24px] text-white/70">
              იპოვე შენი სასურველი ვაკანსია და დასაქმდი ბაკურიანში მარტივად
            </p>
          </ScrollReveal>
        </div>
      </section>

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
          <aside className="hidden w-[280px] shrink-0 lg:block">
            <div className="sticky top-24">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-[10px] font-bold uppercase tracking-[1px] text-[#94A3B8]">
                  ფილტრები
                </h2>
                {hasActiveFilters && (
                  <button
                    onClick={clearFilters}
                    className="text-xs text-brand-error hover:underline"
                  >
                    გასუფთავება
                  </button>
                )}
              </div>
              <div className="rounded-[24px] border border-[#E2E8F0] bg-white p-4">
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
                    className="h-9 w-full rounded-lg border border-[#E2E8F0] bg-white px-3 text-sm outline-none placeholder:text-[#64748B] focus:border-[#DBEAFE] focus:ring-2 focus:ring-[#DBEAFE]/50"
                  />
                  <span className="text-sm text-[#64748B]">–</span>
                  <input
                    type="number"
                    min={0}
                    placeholder="მაქს."
                    value={priceMax}
                    onChange={(e) =>
                      setPriceMax(e.target.value ? Number(e.target.value) : "")
                    }
                    className="h-9 w-full rounded-lg border border-[#E2E8F0] bg-white px-3 text-sm outline-none placeholder:text-[#64748B] focus:border-[#DBEAFE] focus:ring-2 focus:ring-[#DBEAFE]/50"
                  />
                  <span className="text-sm text-[#64748B]">₾</span>
                </div>
              </div>
            </div>
          </aside>
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
                  className="fixed inset-y-0 left-0 z-50 w-[320px] overflow-y-auto bg-white p-4 shadow-xl lg:hidden"
                >
                  <div className="mb-4 flex items-center justify-between">
                    <h2 className="text-[17px] font-black text-[#1E293B]">
                      ფილტრები
                    </h2>
                    <button
                      onClick={() => setMobileFiltersOpen(false)}
                      className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-[#F8FAFC]"
                    >
                      <X className="h-5 w-5" />
                    </button>
                  </div>
                  <div className="rounded-[24px] border border-[#E2E8F0] bg-white p-4">
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
                        className="h-9 w-full rounded-lg border border-[#E2E8F0] bg-white px-3 text-sm outline-none"
                      />
                      <span className="text-sm text-[#64748B]">–</span>
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
                        className="h-9 w-full rounded-lg border border-[#E2E8F0] bg-white px-3 text-sm outline-none"
                      />
                      <span className="text-sm text-[#64748B]">₾</span>
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
          <div className="flex-1">
            {filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[#F8FAFC]">
                  <Briefcase className="h-8 w-8 text-[#64748B]" />
                </div>
                <h3 className="text-[17px] font-black text-[#1E293B]">
                  ვაკანსიები ვერ მოიძებნა
                </h3>
                <p className="mt-1 text-sm text-[#64748B]">
                  სცადეთ ფილტრების შეცვლა
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 2xl:grid-cols-3">
                {filtered.map((s, i) => (
                  <ScrollReveal key={s.id} delay={i * 0.05}>
                    <ServiceCard
                      id={s.id}
                      title={s.title}
                      category={s.category}
                      location={s.location}
                      photos={s.photos ?? []}
                      price={s.price}
                      priceUnit={s.price_unit}
                      discountPercent={s.discount_percent ?? 0}
                      isVip={s.is_vip ?? false}
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
