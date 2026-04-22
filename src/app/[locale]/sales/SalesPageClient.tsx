"use client";

import {
  useState,
  useMemo,
  useCallback,
  useRef,
  useEffect,
  useTransition,
} from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import {
  Home,
  TrendingUp,
  Building2,
  BarChart3,
  DollarSign,
  ArrowRight,
  MapPin,
} from "lucide-react";
import type { Tables } from "@/lib/types/database";
import PropertyCard from "@/components/cards/PropertyCard";
import ScrollReveal from "@/components/shared/ScrollReveal";
import {
  SaleSearchBox,
  type SaleSearchFilters,
} from "@/components/search/SaleSearchBox";
import { SalePagination } from "@/components/search/SalePagination";
import { RentBuyToggle } from "@/components/search/RentBuyToggle";
import { cn } from "@/lib/utils";
import { formatPrice } from "@/lib/utils/format";

const ITEMS_PER_PAGE = 6;

type ListingTab = "all" | "vip" | "discount";

interface Props {
  properties: Tables<"properties">[];
}

export default function SalesPageClient({ properties }: Props) {
  const [mode, setMode] = useState<"rent" | "sale">("sale");
  const [currentPage, setCurrentPage] = useState(1);
  const [listingTab, setListingTab] = useState<ListingTab>("all");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const handleModeChange = useCallback(
    (next: "rent" | "sale") => {
      if (next === "rent") {
        startTransition(() => router.push("/apartments"));
        return;
      }
      setMode(next);
    },
    [router],
  );

  const investmentStats = useMemo(() => {
    const sellable = properties.filter((p) => p.sale_price);
    const avgRoi =
      sellable.reduce((sum, p) => sum + (Number(p.roi_percent) || 0), 0) /
      Math.max(1, sellable.length);
    const avgPrice =
      sellable.reduce((sum, p) => sum + Number(p.sale_price || 0), 0) /
      Math.max(1, sellable.length);
    return {
      avgRoi: avgRoi > 0 ? avgRoi : 10.6,
      listings: properties.length,
      avgPrice: avgPrice > 0 ? Math.round(avgPrice) : 142000,
    };
  }, [properties]);

  const featuredProject = useMemo(
    () => properties.find((p) => p.construction_status || p.developer) ?? null,
    [properties],
  );

  const handleSearch = useCallback(
    (sf: SaleSearchFilters) => {
      const params = new URLSearchParams();
      if (sf.location) params.set("location", sf.location);
      if (sf.propertyType) params.set("type", sf.propertyType);
      if (sf.propertyTypes.length)
        params.set("types", sf.propertyTypes.join(","));
      if (sf.priceMin > 0) params.set("price_min", String(sf.priceMin));
      if (sf.priceMax > 0) params.set("price_max", String(sf.priceMax));
      if (sf.cadastralCode) params.set("cadastral", sf.cadastralCode);
      if (sf.statuses.length) params.set("status", sf.statuses.join(","));
      if (sf.rooms.length) params.set("rooms", sf.rooms.join(","));
      if (sf.areaMin > 0) params.set("area_min", String(sf.areaMin));
      if (sf.areaMax > 0 && sf.areaMax < 500)
        params.set("area_max", String(sf.areaMax));
      if (sf.amenities.length) params.set("amenities", sf.amenities.join(","));
      if (sf.payment.length) params.set("payment", sf.payment.join(","));
      if (sf.developers.length)
        params.set("developer", sf.developers.join(","));
      startTransition(() => {
        router.push(`/sales/all?${params.toString()}`);
      });
    },
    [router],
  );

  const listingsRef = useRef<HTMLElement>(null);

  const goToPage = (page: number) => {
    setCurrentPage(page);
    listingsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const filteredProperties = useMemo(() => {
    if (listingTab === "vip") {
      return properties.filter((p) => p.is_vip || p.is_super_vip);
    }
    if (listingTab === "discount") {
      return properties.filter((p) => (p.discount_percent ?? 0) > 0);
    }
    return properties;
  }, [properties, listingTab]);

  const totalPages = Math.max(
    1,
    Math.ceil(filteredProperties.length / ITEMS_PER_PAGE),
  );
  const paginatedProperties = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredProperties.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredProperties, currentPage]);

  useEffect(() => {
    setCurrentPage((prev) => Math.min(prev, totalPages));
  }, [totalPages]);

  useEffect(() => {
    setCurrentPage(1);
  }, [listingTab]);

  const investmentCards = [
    {
      icon: <TrendingUp className="size-[18px] text-[#22C55E]" />,
      value: `${investmentStats.avgRoi.toFixed(1)}%`,
      label: "საშუალო ROI",
      highlight: false,
    },
    {
      icon: <Building2 className="size-[18px] text-[#CBD5E1]" />,
      value: String(investmentStats.listings),
      label: "აქტიური განცხადებები",
      highlight: false,
    },
    {
      icon: <BarChart3 className="size-[18px] text-[#22C55E]" />,
      value: "+17%",
      label: "ფასების ზრდა",
      highlight: false,
    },
    {
      icon: <DollarSign className="size-[18px] text-white" />,
      value: formatPrice(investmentStats.avgPrice),
      label: "საშუალო ფასი",
      highlight: true,
    },
  ];

  return (
    <div className="flex min-h-screen flex-col bg-[#F8FAFC]">
      <section
        className="relative flex min-h-[470px] items-start justify-center overflow-visible px-4 pb-24 pt-20"
        style={{
          background:
            "linear-gradient(90deg, #0B2E26 -4.88%, #0F3F33 51.09%, #11513F 119.49%)",
        }}
      >
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
        <div className="relative z-10 mx-auto w-full max-w-[1280px] text-center">
          <ScrollReveal>
            <h1 className="text-2xl font-black leading-[1] tracking-[-1.25px] text-white sm:text-4xl md:text-[50px] md:leading-[50px]">
              აღმოაჩინე ბაკურიანში
            </h1>
            <p className="mt-3 text-[18px] font-bold leading-[28px] text-[#4ADE80] sm:text-[22px]">
              შენი ახალი სახლი
            </p>
          </ScrollReveal>

          <div className="mt-6 flex justify-center">
            <RentBuyToggle value={mode} onChange={handleModeChange} />
          </div>

          <div className="mt-6">
            <SaleSearchBox
              onSearch={handleSearch}
              isPending={isPending}
              className="shadow-[var(--shadow-search)]"
            />
          </div>

          <div className="mt-8 grid grid-cols-2 gap-5 sm:grid-cols-4">
            {investmentCards.map((card) => (
              <div
                key={card.label}
                className={cn(
                  "flex items-center rounded-[16px] px-5 py-5 shadow-[0px_10px_15px_-3px_rgba(0,0,0,0.1),0px_4px_6px_-4px_rgba(0,0,0,0.1)]",
                  card.highlight
                    ? "border border-[#22C55E] bg-[#0B3D2E] ring-1 ring-[#22C55E]/40"
                    : "border border-white/5 bg-[#222A3B]",
                )}
              >
                <div className="flex w-full flex-col gap-1 text-left">
                  <span
                    className={cn(
                      "text-[11px] font-bold uppercase tracking-[0.55px]",
                      card.highlight ? "text-[#86EFAC]" : "text-[#94A3B8]",
                    )}
                  >
                    {card.label}
                  </span>
                  <span className="flex items-center justify-between gap-2 text-[20px] font-black leading-[28px] text-white">
                    {card.value}
                    {card.icon}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {featuredProject && (
        <section className="mx-auto w-full max-w-[1280px] px-4 pt-16">
          <ScrollReveal>
            <div className="mb-6 flex items-center justify-between">
              <h2 className="text-[26px] font-black leading-[32px] text-[#1E293B]">
                საინვესტიციო ობიექტები
              </h2>
              <button
                type="button"
                onClick={() => {
                  listingsRef.current?.scrollIntoView({ behavior: "smooth" });
                }}
                className="flex items-center gap-1 text-[13px] font-bold text-[#16A34A] transition-colors hover:text-[#15803D]"
              >
                ნახე ყველა
                <ArrowRight className="size-3.5" />
              </button>
            </div>
          </ScrollReveal>
          <ScrollReveal>
            <div
              role="button"
              tabIndex={0}
              onClick={() => router.push(`/sales/${featuredProject.id}`)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  router.push(`/sales/${featuredProject.id}`);
                }
              }}
              className="group grid cursor-pointer grid-cols-1 overflow-hidden rounded-[24px] border border-[#F1F5F9] bg-white shadow-[0px_4px_20px_-2px_rgba(0,0,0,0.05)] transition-shadow hover:shadow-[var(--shadow-card-hover)] md:grid-cols-[1.3fr_1fr]"
            >
              <div className="relative aspect-[16/10] w-full overflow-hidden md:aspect-auto md:h-full md:min-h-[280px]">
                <Image
                  src={
                    (Array.isArray(featuredProject.photos)
                      ? (featuredProject.photos[0] as string)
                      : undefined) ?? "/placeholder-property.jpg"
                  }
                  alt={featuredProject.title}
                  fill
                  sizes="(max-width: 768px) 100vw, 50vw"
                  className="object-cover transition-transform duration-300 group-hover:scale-105"
                />
                {featuredProject.construction_status && (
                  <span className="absolute left-4 top-4 rounded-full bg-[#22C55E] px-3 py-1.5 text-[11px] font-bold text-white shadow-sm">
                    {featuredProject.construction_status}
                  </span>
                )}
              </div>
              <div className="flex flex-col justify-center gap-4 bg-[#ECFDF5] p-8">
                <div>
                  <h3 className="text-[22px] font-black leading-[28px] text-[#1E293B]">
                    {featuredProject.title}
                  </h3>
                  {featuredProject.developer && (
                    <p className="mt-1 text-[12px] font-bold uppercase tracking-[0.5px] text-[#16A34A]">
                      {featuredProject.developer}
                    </p>
                  )}
                </div>
                {featuredProject.description && (
                  <p className="line-clamp-3 text-[13px] leading-[20px] text-[#64748B]">
                    {featuredProject.description}
                  </p>
                )}
                <div className="flex items-center gap-2 text-[12px] font-medium text-[#64748B]">
                  <MapPin className="size-3.5 text-[#16A34A]" />
                  {featuredProject.location}
                </div>
                <div className="mt-auto flex items-end justify-between pt-2">
                  <div>
                    <span className="block text-[11px] font-bold uppercase tracking-[0.5px] text-[#94A3B8]">
                      ფასი
                    </span>
                    <span className="text-[24px] font-black leading-[32px] text-[#1E293B]">
                      {featuredProject.sale_price
                        ? formatPrice(Number(featuredProject.sale_price))
                        : "შეთანხმებით"}
                    </span>
                  </div>
                  <span className="flex h-[44px] items-center gap-1.5 rounded-full bg-[#16A34A] px-5 text-[13px] font-bold text-white transition-colors group-hover:bg-[#15803D]">
                    დეტალები
                    <ArrowRight className="size-3.5" />
                  </span>
                </div>
              </div>
            </div>
          </ScrollReveal>
        </section>
      )}

      <section
        ref={listingsRef}
        className="mx-auto w-full max-w-[1280px] px-4 py-16"
      >
        <ScrollReveal>
          <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-[26px] font-black leading-[32px] text-[#1E293B]">
                იყიდება ბინები ბაკურიანში
              </h2>
              <p className="mt-1 text-[13px] font-medium leading-[20px] text-[#64748B]">
                საინვესტიციო უძრავი ქონება ბაკურიანში
                {filteredProperties.length > 0 && (
                  <span className="ml-1 text-[#94A3B8]">
                    · {filteredProperties.length} განცხადება
                  </span>
                )}
              </p>
            </div>
            <div className="flex items-center gap-1 rounded-full border border-[#E2E8F0] bg-white p-1">
              {(
                [
                  { id: "all", label: "ყველა" },
                  { id: "vip", label: "VIP" },
                  { id: "discount", label: "ფასდაკლება" },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setListingTab(tab.id)}
                  className={cn(
                    "rounded-full px-4 py-1.5 text-[12px] font-bold transition-colors",
                    listingTab === tab.id
                      ? "bg-[#16A34A] text-white"
                      : "text-[#64748B] hover:text-[#1E293B]",
                  )}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
        </ScrollReveal>

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
                  isForSale
                  amenityTags={
                    Array.isArray(p.amenities) ? (p.amenities as string[]) : []
                  }
                />
              </ScrollReveal>
            ))}
          </div>
        )}

        <SalePagination
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={goToPage}
        />
      </section>

      <section className="mx-auto w-full max-w-[1280px] px-4 pb-20">
        <ScrollReveal>
          <div className="overflow-hidden rounded-[24px] border border-[#F1F5F9] bg-white p-8 shadow-[0px_4px_20px_-2px_rgba(0,0,0,0.05)] md:p-12">
            <div className="grid grid-cols-1 items-center gap-12 md:grid-cols-[1.1fr_1fr]">
              <div>
                <h2 className="text-[26px] font-black leading-[32px] text-[#1E293B] md:text-[32px] md:leading-[40px]">
                  რატომ არის ბაკურიანი საუკეთესო ინვესტიცია?
                </h2>
                <p className="mt-3 text-[14px] leading-[22px] text-[#64748B]">
                  ბაკურიანი ერთ-ერთი ყველაზე სწრაფად მზარდი ტურისტული ზონაა
                  საქართველოში. ROI სტაბილურად იზრდება, ხოლო მოთხოვნა უძრავ
                  ქონებაზე წლიდან წლამდე მატულობს.
                </p>
                <div className="mt-6 grid grid-cols-2 gap-4">
                  <div className="rounded-[16px] border border-[#DCFCE7] bg-[#F0FDF4] p-5">
                    <span className="text-[11px] font-bold uppercase tracking-[0.5px] text-[#16A34A]">
                      წლიური ზრდა
                    </span>
                    <div className="mt-1 text-[28px] font-black leading-[36px] text-[#15803D]">
                      19.74%
                    </div>
                  </div>
                  <div className="rounded-[16px] border border-[#E2E8F0] bg-[#F8FAFC] p-5">
                    <span className="text-[11px] font-bold uppercase tracking-[0.5px] text-[#64748B]">
                      დამატებითი სტუმარი
                    </span>
                    <div className="mt-1 text-[28px] font-black leading-[36px] text-[#1E293B]">
                      +11,000
                    </div>
                  </div>
                </div>
              </div>
              <div className="flex justify-center">
                <DonutChart percentage={investmentStats.avgRoi} />
              </div>
            </div>
          </div>
        </ScrollReveal>
      </section>
    </div>
  );
}

function DonutChart({ percentage }: { percentage: number }) {
  const pct = Math.max(0, Math.min(100, percentage));
  const size = 220;
  const strokeWidth = 24;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (pct / 100) * circumference;

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="#F1F5F9"
          strokeWidth={strokeWidth}
          fill="none"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="#16A34A"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-all duration-500"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-[12px] font-bold uppercase tracking-[0.5px] text-[#64748B]">
          ROI
        </span>
        <span className="text-[36px] font-black leading-[44px] text-[#1E293B]">
          {pct.toFixed(1)}%
        </span>
        <span className="mt-1 text-[11px] font-medium text-[#94A3B8]">
          ბაკურიანი
        </span>
      </div>
    </div>
  );
}
