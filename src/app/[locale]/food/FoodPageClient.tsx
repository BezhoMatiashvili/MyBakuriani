"use client";
import { useState, useMemo } from "react";
import {
  Search,
  UtensilsCrossed,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { useTranslations } from "next-intl";
import type { Tables } from "@/lib/types/database";
import ServiceCard from "@/components/cards/ServiceCard";
import ScrollReveal from "@/components/shared/ScrollReveal";
import BannerSlot from "@/components/banners/BannerSlot";
import { ResponsiveFilterSheet } from "@/components/shared/ResponsiveFilterSheet";
import { isDiscountActive } from "@/lib/utils/pricing";

const OBJECT_TYPES = [
  "all",
  "restaurant",
  "cafe",
  "bar",
  "fastfood",
  "other",
] as const;

// `value` is matched against DB `location` values and must stay Georgian.
const LOCATION_FILTERS = [
  { value: "all", key: "all" },
  { value: "დიდველი", key: "didveli" },
  { value: "კოხტა", key: "kokhta" },
  { value: "ცენტრი", key: "tsentri" },
  { value: "25-იანები", key: "d25" },
  { value: "other", key: "other" },
] as const;

const KNOWN_LOCATIONS = new Set(["დიდველი", "კოხტა", "ცენტრი", "25-იანები"]);

const ITEMS_PER_PAGE = 9;

interface Props {
  services: Tables<"services">[];
}

function matchesObjectType(s: Tables<"services">, value: string): boolean {
  const cuisine = (s.cuisine_type ?? "").toLowerCase();
  switch (value) {
    case "restaurant":
      return cuisine === "georgian" || cuisine === "european";
    case "cafe":
      return cuisine === "cafe";
    case "bar":
      return cuisine === "bar";
    case "fastfood":
      return cuisine === "fastfood" || cuisine === "pizza";
    case "other":
      return ![
        "georgian",
        "european",
        "cafe",
        "bar",
        "fastfood",
        "pizza",
      ].includes(cuisine);
    default:
      return true;
  }
}

export default function FoodPageClient({ services }: Props) {
  const t = useTranslations("FoodPage");
  const tShared = useTranslations("Shared");
  const [activeType, setActiveType] = useState<string>("all");
  const [activeLocation, setActiveLocation] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);

  const filtered = useMemo(() => {
    return services
      .filter((s) => {
        if (activeType !== "all" && !matchesObjectType(s, activeType))
          return false;
        if (activeLocation !== "all") {
          const loc = s.location ?? "";
          if (activeLocation === "other") {
            if (KNOWN_LOCATIONS.has(loc)) return false;
          } else if (loc !== activeLocation) {
            return false;
          }
        }
        if (
          searchQuery &&
          !s.title.toLowerCase().includes(searchQuery.toLowerCase())
        )
          return false;
        return true;
      })
      .sort((a, b) => {
        const aDiscount = isDiscountActive(
          a.discount_percent,
          a.discount_expires_at,
        );
        const bDiscount = isDiscountActive(
          b.discount_percent,
          b.discount_expires_at,
        );
        if (aDiscount !== bDiscount) return aDiscount ? -1 : 1;
        if (Boolean(a.is_vip) !== Boolean(b.is_vip)) return a.is_vip ? -1 : 1;
        return (
          new Date(b.created_at ?? 0).getTime() -
          new Date(a.created_at ?? 0).getTime()
        );
      });
  }, [services, activeType, activeLocation, searchQuery]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE));
  const paginated = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filtered.slice(start, start + ITEMS_PER_PAGE);
  }, [filtered, currentPage]);

  const pageNumbers = Array.from({ length: totalPages }, (_, i) => i + 1);

  return (
    <div className="flex min-h-screen flex-col bg-[#F8FAFC]">
      {/* Hero */}
      <section
        className="relative px-4 pb-16 pt-12 text-center lg:pb-20 lg:pt-16"
        style={{
          background:
            "linear-gradient(135deg, #0E2150 0%, #1E3A7B 55%, #E8612D 140%)",
        }}
      >
        <div className="mx-auto max-w-3xl">
          <ScrollReveal>
            <h1 className="text-[30px] font-black leading-[38px] lg:text-[48px] lg:leading-[56px]">
              <span className="text-white">{t("heroTitle1")}</span>{" "}
              <span className="text-white">{t("heroTitle2")}</span>
            </h1>
            <p className="mx-auto mt-4 max-w-xl text-[15px] leading-[24px] text-white/80">
              {t("heroSubtitle")}
            </p>
          </ScrollReveal>
          <div className="mx-auto mt-8 flex max-w-[720px] items-center gap-2 rounded-full bg-white p-2 shadow-lg">
            <div className="flex flex-1 items-center gap-2 pl-4">
              <Search className="h-5 w-5 text-[#94A3B8]" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setCurrentPage(1);
                }}
                placeholder={t("searchPlaceholder")}
                className="h-10 w-full border-0 bg-transparent text-sm text-[#1E293B] outline-none placeholder:text-[#94A3B8]"
              />
            </div>
            <button
              type="button"
              className="h-11 shrink-0 rounded-full bg-[#2563EB] px-6 text-sm font-bold text-white transition-colors hover:bg-[#1D4ED8] lg:h-10"
            >
              {t("search")}
            </button>
          </div>
        </div>
      </section>

      {/* Filters card */}
      <ResponsiveFilterSheet
        title={t("objectTypeLabel")}
        selectedLabels={[
          activeType !== "all" ? t(`objectTypes.${activeType}`) : null,
          activeLocation !== "all"
            ? t(
                `locations.${LOCATION_FILTERS.find((item) => item.value === activeLocation)?.key ?? "all"}`,
              )
            : null,
        ].filter((label): label is string => label !== null)}
      >
        <div className="relative z-10 mx-auto -mt-16 max-w-7xl rounded-[28px] bg-white p-6 shadow-[0px_10px_40px_-8px_rgba(15,23,42,0.15)] sm:p-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <span className="shrink-0 text-[11px] font-bold uppercase tracking-[1.5px] text-[#94A3B8] sm:w-[140px]">
              {t("objectTypeLabel")}
            </span>
            <div className="scrollbar-hide flex flex-1 flex-nowrap gap-2 overflow-x-auto lg:flex-wrap lg:overflow-visible">
              {OBJECT_TYPES.map((value) => (
                <button
                  key={value}
                  onClick={() => {
                    setActiveType(value);
                    setCurrentPage(1);
                  }}
                  className={`min-h-11 shrink-0 rounded-full px-5 py-2 text-sm font-medium transition-colors lg:min-h-0 ${
                    activeType === value
                      ? "bg-[#2563EB] text-white shadow-[0px_4px_10px_-2px_rgba(37,99,235,0.35)]"
                      : "bg-[#F8FAFC] text-[#475569] hover:bg-[#F1F5F9]"
                  }`}
                >
                  {t(`objectTypes.${value}`)}
                </button>
              ))}
            </div>
          </div>
          <div className="my-5 h-px w-full bg-[#E2E8F0]" />
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <span className="shrink-0 text-[11px] font-bold uppercase tracking-[1.5px] text-[#94A3B8] sm:w-[140px]">
              {t("locationLabel")}
            </span>
            <div className="scrollbar-hide flex flex-1 flex-nowrap gap-2 overflow-x-auto lg:flex-wrap lg:overflow-visible">
              {LOCATION_FILTERS.map((cat) => (
                <button
                  key={cat.value}
                  onClick={() => {
                    setActiveLocation(cat.value);
                    setCurrentPage(1);
                  }}
                  className={`min-h-11 shrink-0 rounded-full px-5 py-2 text-sm font-medium transition-colors lg:min-h-0 ${
                    activeLocation === cat.value
                      ? "bg-[#2563EB] text-white shadow-[0px_4px_10px_-2px_rgba(37,99,235,0.35)]"
                      : "bg-[#F8FAFC] text-[#475569] hover:bg-[#F1F5F9]"
                  }`}
                >
                  {t(`locations.${cat.key}`)}
                </button>
              ))}
            </div>
          </div>
        </div>
      </ResponsiveFilterSheet>

      {/* Results */}
      <section className="mx-auto w-full max-w-7xl flex-1 px-4 py-12">
        <h2 className="mb-6 text-[28px] font-black leading-[34px] text-[#1E293B]">
          {t("results", { count: filtered.length })}
        </h2>
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[#F8FAFC]">
              <UtensilsCrossed className="h-8 w-8 text-[#64748B]" />
            </div>
            <h3 className="text-[17px] font-black text-[#1E293B]">
              {tShared("noListingsFound")}
            </h3>
            <p className="mt-1 text-sm text-[#64748B]">
              {tShared("tryChangeFilters")}
            </p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 lg:gap-6">
              <BannerSlot
                placement="listing_top"
                bare
                className="col-span-full"
              />
              <BannerSlot placement="listing_grid" bare />

              {paginated.map((s, i) => (
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
                    discountExpiresAt={s.discount_expires_at}
                    isVip={s.is_vip ?? false}
                    variant="overlay"
                    phone={s.phone}
                    description={s.description}
                  />
                </ScrollReveal>
              ))}
            </div>
            {totalPages > 1 && (
              <div className="mt-12 flex flex-wrap items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="flex size-11 items-center justify-center rounded-full border border-[#E2E8F0] bg-white text-[#64748B] transition-colors hover:bg-[#F8FAFC] disabled:cursor-not-allowed disabled:opacity-50 lg:size-10"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                {pageNumbers.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setCurrentPage(p)}
                    className={`flex size-11 items-center justify-center rounded-full text-sm font-bold transition-colors lg:size-10 ${
                      currentPage === p
                        ? "bg-[#2563EB] text-white"
                        : "border border-[#E2E8F0] bg-white text-[#64748B] hover:bg-[#F8FAFC]"
                    }`}
                  >
                    {p}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() =>
                    setCurrentPage((p) => Math.min(totalPages, p + 1))
                  }
                  disabled={currentPage === totalPages}
                  className="flex size-11 items-center justify-center rounded-full border border-[#E2E8F0] bg-white text-[#64748B] transition-colors hover:bg-[#F8FAFC] disabled:cursor-not-allowed disabled:opacity-50 lg:size-10"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}
