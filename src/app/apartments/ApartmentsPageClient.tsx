"use client";

import { useState, useMemo, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Home,
  Plus,
  ChevronLeft,
  ChevronRight,
  Car,
  Video,
} from "lucide-react";
import dynamic from "next/dynamic";
import type { Tables } from "@/lib/types/database";
import PropertyCard from "@/components/cards/PropertyCard";
import ScrollReveal from "@/components/shared/ScrollReveal";
import {
  SearchBox,
  type SearchFilters,
  type ActiveDropdown,
} from "@/components/search/SearchBox";
import { RentBuyToggle } from "@/components/search/RentBuyToggle";
import { cn } from "@/lib/utils";

const BakurianiMap = dynamic(() => import("@/components/maps/BakurianiMap"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center bg-[#F8FAFC]">
      <div className="size-6 animate-spin rounded-full border-2 border-[#CBD5E1] border-t-[#2563EB]" />
    </div>
  ),
});

const ITEMS_PER_PAGE = 9;

const STATUS_CARDS = [
  { label: "ამინდი", value: "-4°C", fontSize: "text-[24px]" },
  {
    label: "საბაგიროები",
    value: "3/5 ღიაა",
    fontSize: "text-[20px]",
    iconType: "ski" as const,
  },
  {
    label: "გზა თბილისიდან",
    value: "თავისუფალი",
    fontSize: "text-[18px]",
    iconType: "car" as const,
  },
  {
    label: "კამერები",
    value: "2 ლოკაცია",
    fontSize: "text-[18px]",
    iconType: "camera" as const,
    hasRedDot: true,
  },
];

interface Props {
  properties: Tables<"properties">[];
}

export default function ApartmentsPageClient({ properties }: Props) {
  const [mode, setMode] = useState<"rent" | "sale">("rent");
  const [activeDropdown, setActiveDropdown] = useState<ActiveDropdown>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [onlyAvailable, setOnlyAvailable] = useState(false);
  const dropdownPortalRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  const handleSearch = useCallback(
    (sf: SearchFilters) => {
      const params = new URLSearchParams();
      if (sf.location) params.set("location", sf.location);
      if (sf.checkIn) params.set("check_in", sf.checkIn);
      if (sf.checkOut) params.set("check_out", sf.checkOut);
      if (sf.guests) params.set("guests", String(sf.guests));
      if (sf.cadastralCode) params.set("cadastral", sf.cadastralCode);
      params.set("mode", mode);
      router.push(`/search?${params.toString()}`);
    },
    [mode, router],
  );

  const listingsRef = useRef<HTMLElement>(null);

  const goToPage = (page: number) => {
    setCurrentPage(page);
    listingsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const totalPages = Math.max(1, Math.ceil(properties.length / ITEMS_PER_PAGE));
  const paginatedProperties = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return properties.slice(start, start + ITEMS_PER_PAGE);
  }, [properties, currentPage]);

  const getPageNumbers = () => {
    const pages: (number | "...")[] = [];
    if (totalPages <= 5) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      if (currentPage > 3) pages.push("...");
      const start = Math.max(2, currentPage - 1);
      const end = Math.min(totalPages - 1, currentPage + 1);
      for (let i = start; i <= end; i++) pages.push(i);
      if (currentPage < totalPages - 2) pages.push("...");
      pages.push(totalPages);
    }
    return pages;
  };

  return (
    <div className="flex min-h-screen flex-col bg-[#F8FAFC]">
      {/* ═══ Hero Section ═══ */}
      <section
        className={cn(
          "relative flex min-h-[470px] items-start justify-center px-4 pb-20 pt-16",
          activeDropdown ? "overflow-visible" : "overflow-hidden",
        )}
        style={{
          background:
            "linear-gradient(90deg, #101A33 -4.88%, #0E2150 51.09%, #1E419A 119.49%)",
        }}
      >
        {/* Subtle texture overlay */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage:
              "url('https://images.unsplash.com/photo-1483728642387-6c3bdd6c93e5?w=1600&h=600&fit=crop&q=30')",
            backgroundSize: "cover",
            backgroundPosition: "center bottom",
            mixBlendMode: "overlay",
          }}
        />
        <div className="relative z-10 mx-auto w-full max-w-[1160px] text-center">
          <ScrollReveal>
            <h1 className="text-2xl font-black leading-[1] tracking-[-1.25px] text-white sm:text-4xl md:text-[50px] md:leading-[50px]">
              ყველაზე სანდო გზამკვლევი{" "}
              <span className="text-[#38BDF8]">ბაკურიანში</span>
            </h1>
          </ScrollReveal>

          <div className="mt-6 flex justify-center">
            <RentBuyToggle value={mode} onChange={setMode} />
          </div>

          <div className="mt-6">
            <SearchBox
              onSearch={handleSearch}
              className="shadow-[var(--shadow-search)]"
              dropdownPortalRef={dropdownPortalRef}
              onActiveDropdownChange={setActiveDropdown}
            />
          </div>

          {/* Dropdown Panel Areas */}
          {activeDropdown === "filters" ? (
            <div className="mt-8 hidden overflow-hidden rounded-3xl border border-[#E2E8F0] shadow-[0px_25px_50px_-12px_rgba(0,0,0,0.25)] md:flex">
              <div ref={dropdownPortalRef} className="min-w-0 flex-1" />
              <BakurianiMap
                className="min-h-[400px] w-[280px] shrink-0 self-stretch"
                embedded
              />
            </div>
          ) : activeDropdown === "calendar" ? (
            <div className="mt-8 hidden grid-cols-[1fr_auto] gap-4 md:grid">
              <div ref={dropdownPortalRef} className="min-w-0" />
              <div className="flex w-[240px] flex-col gap-3">
                <div className="flex items-center rounded-[16px] border border-white/5 bg-[#222A3B] px-5 py-5 shadow-[var(--shadow-dark-card)]">
                  <div className="flex flex-col gap-1">
                    <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.55px] text-[#94A3B8]">
                      <span className="size-2 rounded-full bg-[#EF4444]" />
                      კამერები
                    </span>
                    <span className="flex items-center gap-2 text-[18px] font-black leading-[28px] text-white">
                      2 ლოკაცია
                      <Video className="size-[18px] text-[#CBD5E1]" />
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  className="flex h-[52px] items-center justify-center rounded-[16px] border-2 border-[#E8612D] bg-[#FFF7ED] text-[14px] font-bold text-[#E8612D] transition-colors hover:bg-[#FFEDD5]"
                >
                  კუპონის აღება
                </button>
                <div className="flex items-center justify-between rounded-[16px] border border-[#FFEDD5] bg-[#FFF7ED] px-4 py-3">
                  <span className="flex items-center gap-1.5 text-[12px] font-bold text-[#F97316]">
                    <span className="text-[12px]">{"\uD83D\uDD25"}</span>
                    მხოლოდ ფასდაკლებები
                  </span>
                  <div className="relative inline-flex h-[20px] w-[40px] cursor-pointer items-center rounded-full bg-[#F97316]">
                    <span className="absolute right-0.5 size-[16px] rounded-full bg-white shadow-sm" />
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          {/* Status Cards Row */}
          <div
            className={cn(
              "mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4",
              activeDropdown && activeDropdown !== "location"
                ? "md:hidden"
                : "",
            )}
          >
            {STATUS_CARDS.map((card) => (
              <div
                key={card.label}
                className="flex items-center rounded-[16px] border border-white/5 bg-[#222A3B] px-5 py-5 shadow-[0px_10px_15px_-3px_rgba(0,0,0,0.1),0px_4px_6px_-4px_rgba(0,0,0,0.1)]"
              >
                <div className="flex flex-col gap-1">
                  <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.55px] text-[#94A3B8]">
                    {card.hasRedDot && (
                      <span className="size-2 rounded-full bg-[#EF4444]" />
                    )}
                    {card.label}
                  </span>
                  <span
                    className={`flex items-center gap-2 ${card.fontSize} font-black leading-[28px] text-white`}
                  >
                    {card.value}
                    {card.iconType === "car" && (
                      <Car className="size-[18px] text-[#CBD5E1]" />
                    )}
                    {card.iconType === "camera" && (
                      <Video className="size-[18px] text-[#CBD5E1]" />
                    )}
                    {card.iconType === "ski" && (
                      <span className="text-[18px]">⛷</span>
                    )}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ Listings Section ═══ */}
      <section
        ref={listingsRef}
        className="mx-auto w-full max-w-[1160px] px-4 py-16"
      >
        {/* Section Header */}
        <ScrollReveal>
          <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-[26px] font-black leading-[32px] text-[#1E293B]">
                აპარტამენტები და კოტეჯები
              </h2>
              <p className="mt-1 text-[13px] font-medium leading-[20px] text-[#64748B]">
                კომფორტული დასვენება ოჯახთან და მეგობრებთან ერთად
                {properties.length > 0 && (
                  <span className="ml-1 text-[#94A3B8]">
                    · {properties.length} განცხადება
                  </span>
                )}
              </p>
            </div>
            <div className="flex items-center gap-3">
              {/* Available-only toggle */}
              <button
                type="button"
                onClick={() => setOnlyAvailable(!onlyAvailable)}
                className={cn(
                  "flex items-center gap-2 rounded-full px-4 py-2 text-[12px] font-bold transition-colors",
                  onlyAvailable
                    ? "border border-[#F97316]/30 bg-[#FFF7ED] text-[#F97316]"
                    : "border border-[#E2E8F0] bg-white text-[#64748B]",
                )}
              >
                მხოლოდ ფასდაკლებები
                <div
                  className={cn(
                    "relative inline-flex h-[20px] w-[40px] items-center rounded-full transition-colors",
                    onlyAvailable ? "bg-[#F97316]" : "bg-[#CBD5E1]",
                  )}
                >
                  <span
                    className={cn(
                      "absolute size-[16px] rounded-full bg-white shadow-sm transition-all",
                      onlyAvailable ? "right-0.5" : "left-0.5",
                    )}
                  />
                </div>
              </button>

              {/* Add listing button */}
              <button
                type="button"
                onClick={() => router.push("/create/rental")}
                className="flex items-center gap-1.5 rounded-full border border-[#2563EB] px-4 py-2 text-[12px] font-bold text-[#2563EB] transition-colors hover:bg-[#EFF6FF]"
              >
                <Plus className="size-3.5" />
                დამატება
              </button>
            </div>
          </div>
        </ScrollReveal>

        {/* Property Grid — 3 columns */}
        {paginatedProperties.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[#F8FAFC]">
              <Home className="h-8 w-8 text-[#94A3B8]" />
            </div>
            <h3 className="text-[17px] font-black leading-[21px] text-[#1E293B]">
              განცხადებები ვერ მოიძებნა
            </h3>
            <p className="mt-1 text-[13px] leading-[20px] text-[#64748B]">
              სცადეთ ფილტრების შეცვლა
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {paginatedProperties.map((p, i) => (
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
                  amenityTags={
                    Array.isArray(p.amenities) ? (p.amenities as string[]) : []
                  }
                />
              </ScrollReveal>
            ))}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="mt-12 flex items-center justify-center gap-2">
            <button
              type="button"
              onClick={() => goToPage(Math.max(1, currentPage - 1))}
              disabled={currentPage === 1}
              className="flex h-[44px] w-[44px] items-center justify-center rounded-full border border-[#E2E8F0] bg-white text-[#64748B] transition-colors hover:bg-[#F8FAFC] disabled:opacity-40"
            >
              <ChevronLeft className="size-5" />
            </button>
            {getPageNumbers().map((page, idx) =>
              page === "..." ? (
                <span
                  key={`dots-${idx}`}
                  className="flex h-[44px] w-[44px] items-center justify-center text-[14px] text-[#94A3B8]"
                >
                  ...
                </span>
              ) : (
                <button
                  key={page}
                  type="button"
                  onClick={() => goToPage(page)}
                  className={cn(
                    "flex h-[44px] w-[44px] items-center justify-center rounded-full text-[14px] font-bold transition-colors",
                    currentPage === page
                      ? "bg-[#2563EB] text-white shadow-md"
                      : "border border-[#E2E8F0] bg-white text-[#64748B] hover:bg-[#F8FAFC]",
                  )}
                >
                  {page}
                </button>
              ),
            )}
            <button
              type="button"
              onClick={() => goToPage(Math.min(totalPages, currentPage + 1))}
              disabled={currentPage === totalPages}
              className="flex h-[44px] w-[44px] items-center justify-center rounded-full border border-[#E2E8F0] bg-white text-[#64748B] transition-colors hover:bg-[#F8FAFC] disabled:opacity-40"
            >
              <ChevronRight className="size-5" />
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
