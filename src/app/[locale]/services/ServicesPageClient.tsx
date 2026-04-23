"use client";
import { useState, useMemo } from "react";
import { Search, Wrench, ChevronLeft, ChevronRight } from "lucide-react";
import type { Tables } from "@/lib/types/database";
import ServiceCard from "@/components/cards/ServiceCard";
import ScrollReveal from "@/components/shared/ScrollReveal";

const CATEGORIES = [
  { value: "all", label: "ყველა" },
  { value: "handyman", label: "ხელოსანი" },
  { value: "cleaning", label: "დასუფთავება" },
  { value: "plumbing", label: "სანტექნიკა" },
  { value: "electric", label: "ელექტრიკოსი" },
  { value: "repair", label: "რემონტი" },
] as const;

const SORT_FILTERS = [
  { value: "recent", label: "ახალი" },
  { value: "popular", label: "პოპულარული" },
  { value: "rating", label: "რეიტინგით" },
  { value: "cheap", label: "იაფი" },
] as const;

const ITEMS_PER_PAGE = 9;

interface Props {
  services: Tables<"services">[];
}

export default function ServicesPageClient({ services }: Props) {
  const [activeCategory, setActiveCategory] = useState("all");
  const [activeSort, setActiveSort] = useState("recent");
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);

  const filtered = useMemo(() => {
    const result = services.filter((s) => {
      if (activeCategory !== "all") {
        const category = (s.category ?? "").toLowerCase();
        if (!category.includes(activeCategory)) return false;
      }
      if (
        searchQuery &&
        !s.title.toLowerCase().includes(searchQuery.toLowerCase())
      )
        return false;
      return true;
    });
    if (activeSort === "cheap") {
      result.sort((a, b) => (a.price ?? 0) - (b.price ?? 0));
    }
    return result;
  }, [services, activeCategory, searchQuery, activeSort]);

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
          background: "linear-gradient(135deg, #0E2150 0%, #1E3A7B 100%)",
        }}
      >
        <div className="mx-auto max-w-3xl">
          <ScrollReveal>
            <h1 className="text-[36px] font-black leading-[44px] text-white sm:text-[48px] sm:leading-[56px]">
              სერვისი და ხელოსნები
            </h1>
            <p className="mx-auto mt-4 max-w-xl text-[15px] leading-[24px] text-white/70">
              სწრაფი და სანდო სერვისი თქვენი კომფორტისთვის ბაკურიანში. ათასობით
              სატისფაის სპეციალისტი მარჯვნივ.
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
                placeholder="რას ეძებთ?"
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

      {/* Filters */}
      <section className="border-b border-[#E2E8F0] bg-white">
        <div className="mx-auto max-w-7xl px-4 py-4">
          <div className="scrollbar-hide -mx-4 flex gap-2 overflow-x-auto px-4">
            {CATEGORIES.map((cat) => (
              <button
                key={cat.value}
                onClick={() => {
                  setActiveCategory(cat.value);
                  setCurrentPage(1);
                }}
                className={`shrink-0 rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                  activeCategory === cat.value
                    ? "bg-[#2563EB] text-white"
                    : "bg-[#F8FAFC] text-[#1E293B] hover:bg-[#F1F5F9]"
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>
          <div className="scrollbar-hide -mx-4 mt-3 flex gap-2 overflow-x-auto px-4">
            {SORT_FILTERS.map((cat) => (
              <button
                key={cat.value}
                onClick={() => setActiveSort(cat.value)}
                className={`shrink-0 rounded-full px-4 py-1.5 text-xs font-medium transition-colors ${
                  activeSort === cat.value
                    ? "bg-[#2563EB] text-white"
                    : "bg-transparent text-[#64748B] hover:bg-[#F8FAFC]"
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Results */}
      <section className="mx-auto w-full max-w-7xl flex-1 px-4 py-8">
        <h2 className="mb-6 text-[20px] font-black text-[#1E293B]">
          შედეგები ({filtered.length})
        </h2>
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[#F8FAFC]">
              <Wrench className="h-8 w-8 text-[#64748B]" />
            </div>
            <h3 className="text-[17px] font-black text-[#1E293B]">
              სერვისები ვერ მოიძებნა
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
                    variant="avatar"
                    schedule={s.schedule}
                    operatingHours={s.operating_hours}
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
