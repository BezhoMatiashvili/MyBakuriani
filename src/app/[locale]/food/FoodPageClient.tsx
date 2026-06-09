"use client";
import { useState, useMemo } from "react";
import {
  Search,
  UtensilsCrossed,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import type { Tables } from "@/lib/types/database";
import ServiceCard from "@/components/cards/ServiceCard";
import ScrollReveal from "@/components/shared/ScrollReveal";

const OBJECT_TYPES = [
  { value: "all", label: "ყველა" },
  { value: "restaurant", label: "რესტორანი" },
  { value: "cafe", label: "კავი / საკონდიტრო" },
  { value: "bar", label: "ბარი / პაბი" },
  { value: "fastfood", label: "სწრაფი კვება" },
  { value: "other", label: "სხვა" },
] as const;

const LOCATION_FILTERS = [
  { value: "all", label: "ყველა" },
  { value: "დიდველი", label: "დიდველი" },
  { value: "კოხტა", label: "კოხტა" },
  { value: "ცენტრი", label: "ცენტრი" },
  { value: "25-იანები", label: "25-იანები" },
  { value: "other", label: "სხვა" },
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
  const [activeType, setActiveType] = useState<string>("all");
  const [activeLocation, setActiveLocation] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);

  const filtered = useMemo(() => {
    return services.filter((s) => {
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
        className="relative px-4 pt-16 pb-20 text-center"
        style={{
          background:
            "linear-gradient(135deg, #0E2150 0%, #1E3A7B 55%, #E8612D 140%)",
        }}
      >
        <div className="mx-auto max-w-3xl">
          <ScrollReveal>
            <h1 className="text-[36px] font-black leading-[44px] sm:text-[48px] sm:leading-[56px]">
              <span className="text-white">კვება და</span>{" "}
              <span className="text-white">რესტორნები</span>
            </h1>
            <p className="mx-auto mt-4 max-w-xl text-[15px] leading-[24px] text-white/80">
              აღმოაჩინეთ საუკეთესო კერძები, რესტორნები, ბარები და ადგილზე
              მიტანის სერვისები ბაკურიანში.
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
                placeholder="რას ეძებთ?..."
                className="h-10 w-full border-0 bg-transparent text-sm text-[#1E293B] outline-none placeholder:text-[#94A3B8]"
              />
            </div>
            <button
              type="button"
              className="h-10 shrink-0 rounded-full bg-[#2563EB] px-6 text-sm font-bold text-white transition-colors hover:bg-[#1D4ED8]"
            >
              ძიება
            </button>
          </div>
        </div>
      </section>

      {/* Filters card */}
      <section className="px-4">
        <div className="relative z-10 mx-auto -mt-16 max-w-7xl rounded-[28px] bg-white p-6 shadow-[0px_10px_40px_-8px_rgba(15,23,42,0.15)] sm:p-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <span className="shrink-0 text-[11px] font-bold uppercase tracking-[1.5px] text-[#94A3B8] sm:w-[140px]">
              ობიექტის ტიპი:
            </span>
            <div className="flex flex-1 flex-wrap gap-2">
              {OBJECT_TYPES.map((cat) => (
                <button
                  key={cat.value}
                  onClick={() => {
                    setActiveType(cat.value);
                    setCurrentPage(1);
                  }}
                  className={`shrink-0 rounded-full px-5 py-2 text-sm font-medium transition-colors ${
                    activeType === cat.value
                      ? "bg-[#2563EB] text-white shadow-[0px_4px_10px_-2px_rgba(37,99,235,0.35)]"
                      : "bg-[#F8FAFC] text-[#475569] hover:bg-[#F1F5F9]"
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>
          </div>
          <div className="my-5 h-px w-full bg-[#E2E8F0]" />
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <span className="shrink-0 text-[11px] font-bold uppercase tracking-[1.5px] text-[#94A3B8] sm:w-[140px]">
              ლოკაცია:
            </span>
            <div className="flex flex-1 flex-wrap gap-2">
              {LOCATION_FILTERS.map((cat) => (
                <button
                  key={cat.value}
                  onClick={() => {
                    setActiveLocation(cat.value);
                    setCurrentPage(1);
                  }}
                  className={`shrink-0 rounded-full px-5 py-2 text-sm font-medium transition-colors ${
                    activeLocation === cat.value
                      ? "bg-[#2563EB] text-white shadow-[0px_4px_10px_-2px_rgba(37,99,235,0.35)]"
                      : "bg-[#F8FAFC] text-[#475569] hover:bg-[#F1F5F9]"
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Results */}
      <section className="mx-auto w-full max-w-7xl flex-1 px-4 py-12">
        <h2 className="mb-6 text-[28px] font-black leading-[34px] text-[#1E293B]">
          შედეგები ({filtered.length})
        </h2>
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[#F8FAFC]">
              <UtensilsCrossed className="h-8 w-8 text-[#64748B]" />
            </div>
            <h3 className="text-[17px] font-black text-[#1E293B]">
              განცხადებები ვერ მოიძებნა
            </h3>
            <p className="mt-1 text-sm text-[#64748B]">
              სცადეთ ფილტრების შეცვლა
            </p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
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
                    isVip={s.is_vip ?? false}
                    variant="overlay"
                    phone={s.phone}
                    description={s.description}
                  />
                </ScrollReveal>
              ))}
            </div>
            {totalPages > 1 && (
              <div className="mt-12 flex items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="flex h-10 w-10 items-center justify-center rounded-full border border-[#E2E8F0] bg-white text-[#64748B] transition-colors hover:bg-[#F8FAFC] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                {pageNumbers.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setCurrentPage(p)}
                    className={`flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold transition-colors ${
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
                  className="flex h-10 w-10 items-center justify-center rounded-full border border-[#E2E8F0] bg-white text-[#64748B] transition-colors hover:bg-[#F8FAFC] disabled:cursor-not-allowed disabled:opacity-50"
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
