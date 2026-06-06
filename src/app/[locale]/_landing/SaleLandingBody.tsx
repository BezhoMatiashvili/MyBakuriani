"use client";

import { useCallback, useMemo, useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import dynamic from "next/dynamic";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowRight,
  ArrowLeft,
  Sparkles,
  CheckCircle2,
  MapPin,
  Plus,
} from "lucide-react";
import { Link } from "@/i18n/navigation";

import { RentBuyToggle } from "@/components/search/RentBuyToggle";
import {
  SaleSearchBox,
  type SaleSearchFilters,
} from "@/components/search/SaleSearchBox";
import SalePropertyCard from "@/components/cards/SalePropertyCard";
import ScrollReveal from "@/components/shared/ScrollReveal";
import { SkierLoader } from "@/components/shared/SkierLoader";
import type { MapProperty } from "@/components/maps/BakurianiMap";
import { cn } from "@/lib/utils";
import { formatNumber } from "@/lib/utils/format";
import type { Tables } from "@/lib/types/database";
import { useHomeListingMode } from "@/components/layout/HomeListingModeContext";
import { MOCK_SALES } from "@/lib/mock/properties";
import type { Zone } from "@/lib/zones/types";
import { ZoneIcon } from "@/lib/zones/icon";

const BakurianiMap = dynamic(() => import("@/components/maps/BakurianiMap"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center bg-[#F8FAFC]">
      <SkierLoader variant="inline" />
    </div>
  ),
});

interface SaleLandingBodyProps {
  mode: "rent" | "sale";
  onModeChange: (mode: "rent" | "sale") => void;
  saleProperties?: Tables<"properties">[];
  pricePerSqmByZone?: Record<string, number | null>;
  zones: Zone[];
}

function formatPricePerSqm(avg: number | null | undefined): string {
  if (avg == null || !Number.isFinite(avg)) return "—";
  return `${formatNumber(avg)} ₾/მ²`;
}

function renderZoneIcon(icon: string, isLast: boolean) {
  return (
    <ZoneIcon
      icon={icon}
      className={`size-[18px] ${isLast ? "text-[#94A3B8]" : "text-[#16A34A]"}`}
    />
  );
}

// Convert GEL → USD for display (rough conversion; backend stores GEL).
const GEL_TO_USD = 1 / 2.7;

function toUsd(gel: number | null | undefined): number {
  if (!gel) return 0;
  return Math.round(gel * GEL_TO_USD);
}

// Deterministic ROI estimate from id so cards stay stable.
function estimatedRoi(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) {
    hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  }
  return 9 + (hash % 9); // 9–17%
}

// Mock sale properties (used when DB is empty) sourced from @/lib/mock/properties

// Hero featured inventory cards (rotated in the carousel)
const FEATURED_INVENTORY_ITEMS = [
  {
    id: "featured-mziuri",
    title: "Mziuri Gardens • პრემიუმ ვილა",
    location: "ლოკაცია: ბაკურიანის ცენტრი",
    area: 185,
    rooms: 5,
    description:
      "სრულად გარემონტებული, ევროპული სტანდარტის ვილა და ჩართული ავეჯით. კომპლექსში მოქმედებს 5-ვარსკვლავიანი ინფრასტრუქტურა.",
    priceUsd: 280_000,
    roi: 12,
    photo:
      "https://images.unsplash.com/photo-1613490493576-7fde63acd811?w=1400&h=900&fit=crop",
  },
  {
    id: "featured-didveli",
    title: "Didveli Heights • პრემიუმ აპარტამენტი",
    location: "ლოკაცია: დიდველი, 80 მ ტრასამდე",
    area: 120,
    rooms: 3,
    description:
      "სათხილამურო ტრასასთან, პანორამული ხედით კოხტას მთაზე. გარემონტებული Smart-Home სისტემით და ცენტრალური გათბობით.",
    priceUsd: 195_000,
    roi: 14,
    photo:
      "https://images.unsplash.com/photo-1564013799919-ab600027ffc6?w=1400&h=900&fit=crop",
  },
  {
    id: "featured-kokhta",
    title: "Kokhta Suites • A-Frame კომპლექსი",
    location: "ლოკაცია: კოხტა, ტყის პირას",
    area: 95,
    rooms: 2,
    description:
      "მოდერნული A-Frame არქიტექტურა, ბუხრით და ფართო ტერასით. იდეალური მცირე-ოჯახური ან Airbnb ინვესტიციისთვის.",
    priceUsd: 145_000,
    roi: 16,
    photo:
      "https://images.unsplash.com/photo-1518602164578-cd0074062767?w=1400&h=900&fit=crop",
  },
];

const INVENTORY_AUTO_ADVANCE_MS = 5000;

// ─── Component ──────────────────────────────────────────────────────────

export default function SaleLandingBody({
  mode,
  onModeChange,
  saleProperties,
  pricePerSqmByZone,
  zones,
}: SaleLandingBodyProps) {
  const router = useRouter();
  const { setListingMode } = useHomeListingMode();

  useEffect(() => {
    setListingMode(mode);
  }, [mode, setListingMode]);

  const [showMap, setShowMap] = useState(false);

  // ─── Featured Inventory carousel state ──────────────────────────────
  const [inventoryIdx, setInventoryIdx] = useState(0);
  const [inventoryReduceMotion, setInventoryReduceMotion] = useState(false);
  const inventoryPaused = useRef(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setInventoryReduceMotion(mq.matches);
    const handler = (e: MediaQueryListEvent) =>
      setInventoryReduceMotion(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  useEffect(() => {
    if (inventoryReduceMotion || FEATURED_INVENTORY_ITEMS.length <= 1) return;
    const timer = setInterval(() => {
      if (!inventoryPaused.current) {
        setInventoryIdx((i) => (i + 1) % FEATURED_INVENTORY_ITEMS.length);
      }
    }, INVENTORY_AUTO_ADVANCE_MS);
    return () => clearInterval(timer);
  }, [inventoryReduceMotion]);

  const nextInventory = () =>
    setInventoryIdx((i) => (i + 1) % FEATURED_INVENTORY_ITEMS.length);
  const prevInventory = () =>
    setInventoryIdx(
      (i) =>
        (i - 1 + FEATURED_INVENTORY_ITEMS.length) %
        FEATURED_INVENTORY_ITEMS.length,
    );

  const handleSearch = useCallback(
    (sf: SaleSearchFilters) => {
      const params = new URLSearchParams();
      if (sf.location) params.set("location", sf.location);
      if (sf.propertyType) params.set("type", sf.propertyType);
      if (sf.propertyTypes.length)
        params.set("types", sf.propertyTypes.join(","));
      if (sf.priceMin) params.set("price_min", String(sf.priceMin));
      if (sf.priceMax) params.set("price_max", String(sf.priceMax));
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
      if (sf.sellerTypes.length) params.set("seller", sf.sellerTypes.join(","));
      if (sf.roiMin != null) params.set("roi_min", String(sf.roiMin));
      if (sf.constructionStatus)
        params.set("construction", sf.constructionStatus);
      if (sf.renovationStatus) params.set("renovation", sf.renovationStatus);
      router.push(`/sales/all?${params.toString()}`);
    },
    [router],
  );

  // Build card data — prefer DB, fall back to mocks.
  const saleCards = useMemo(() => {
    if (saleProperties && saleProperties.length > 0) {
      return saleProperties.map((p) => ({
        id: p.id,
        title: p.title,
        location: p.location,
        photos: Array.isArray(p.photos) ? (p.photos as string[]) : [],
        priceUsd: toUsd(p.sale_price ? Number(p.sale_price) : null),
        area: p.area_sqm ?? null,
        rooms: p.rooms,
        roi: estimatedRoi(p.id),
        constructionStatus: p.construction_status ?? null,
        constructionProgressPercent: p.construction_progress_percent ?? null,
      }));
    }
    return MOCK_SALES;
  }, [saleProperties]);

  const gridCards = saleCards.slice(0, 3);

  const mapProperties = useMemo<MapProperty[]>(
    () =>
      (saleProperties ?? [])
        .filter((p) => p.location_lat && p.location_lng)
        .map((p) => ({
          id: p.id,
          title: p.title,
          price: Number(p.sale_price ?? 0),
          lat: Number(p.location_lat),
          lng: Number(p.location_lng),
          isVip: p.is_vip ?? false,
          isSuperVip: p.is_super_vip ?? false,
          photo: Array.isArray(p.photos) ? (p.photos[0] as string) : undefined,
        })),
    [saleProperties],
  );

  return (
    <div className="flex flex-col">
      {/* ═══ 1. Hero (green) ═══ */}
      <section
        className="relative flex min-h-[620px] items-start justify-center px-4 pb-16 pt-16"
        style={{
          background:
            "linear-gradient(180deg, #0B3A2C 0%, #0F4C3A 55%, #134E3A 100%)",
        }}
      >
        {/* subtle texture */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage:
              "url('https://images.unsplash.com/photo-1483728642387-6c3bdd6c93e5?w=1600&h=600&fit=crop&q=30')",
            backgroundSize: "cover",
            backgroundPosition: "center",
            mixBlendMode: "overlay",
          }}
        />

        <div className="relative z-10 mx-auto w-full max-w-[1180px] text-center">
          <ScrollReveal>
            <h1 className="text-4xl font-black leading-[1.05] tracking-[-1.25px] text-white sm:text-5xl md:text-[64px] md:leading-[68px]">
              აღმოაჩინე ბაკურიანში
              <br />
              <span className="text-[#6EE7B7]">შენი ახალი სახლი</span>
            </h1>
          </ScrollReveal>

          <div className="mt-8 flex justify-center">
            <RentBuyToggle value={mode} onChange={onModeChange} />
          </div>

          <div className="relative z-20 mt-6">
            <SaleSearchBox
              onSearch={handleSearch}
              showInvestmentFilters={true}
              showMap={showMap}
              onShowMapChange={setShowMap}
              zones={zones}
            />
          </div>
        </div>
      </section>

      {/* ═══ Inline map (toggled by რუკაზე in SaleSearchBox) ═══ */}
      {showMap && (
        <div className="mx-auto w-full max-w-[1180px] px-4 pt-6">
          <div className="overflow-hidden rounded-[24px] border border-[#E2E8F0] shadow-[0px_25px_50px_-12px_rgba(0,0,0,0.25)]">
            <BakurianiMap
              className="h-[420px] w-full"
              embedded
              expandable
              isForSale
              properties={mapProperties}
              onPropertyClick={(id) => router.push(`/sales/${id}`)}
              zones={zones}
            />
          </div>
        </div>
      )}

      {/* ═══ Stat cards — straddle the green→white boundary ═══ */}
      <div
        className={cn(
          "relative mx-auto w-full max-w-[1180px] px-4",
          showMap ? "mt-8" : "-mt-20",
        )}
      >
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {zones.map((zone, i) => (
            <StatCard
              key={zone.id}
              label={zone.name_ka}
              value={formatPricePerSqm(pricePerSqmByZone?.[zone.name_ka])}
              icon={renderZoneIcon(zone.icon, i === zones.length - 1)}
              highlight={i === zones.length - 1}
            />
          ))}
        </div>
      </div>

      {/* ═══ 2. Selected Inventory — featured full-width card ═══ */}
      <section className="mx-auto w-full max-w-[1180px] px-4 pb-16 pt-12">
        <ScrollReveal>
          <div className="mb-6 flex items-end justify-between gap-4">
            <div>
              <span className="mb-2 block text-[11px] font-black uppercase tracking-[1.2px] text-[#16A34A]">
                Selected Inventory
              </span>
              <h2 className="text-[26px] font-black leading-[32px] text-[#1E293B]">
                საინვესტიციო ობიექტები
              </h2>
            </div>
            <div className="hidden gap-2 sm:flex">
              <button
                type="button"
                onClick={prevInventory}
                aria-label="წინა"
                className="flex size-10 items-center justify-center rounded-full border border-[#E2E8F0] bg-white text-[#1E293B] transition-colors hover:border-[#16A34A] hover:text-[#16A34A]"
              >
                <ArrowLeft className="size-4" />
              </button>
              <button
                type="button"
                onClick={nextInventory}
                aria-label="შემდეგი"
                className="flex size-10 items-center justify-center rounded-full border border-[#E2E8F0] bg-white text-[#1E293B] transition-colors hover:border-[#16A34A] hover:text-[#16A34A]"
              >
                <ArrowRight className="size-4" />
              </button>
            </div>
          </div>
        </ScrollReveal>

        <div
          className="relative min-h-[640px] md:min-h-[440px]"
          onMouseEnter={() => {
            inventoryPaused.current = true;
          }}
          onMouseLeave={() => {
            inventoryPaused.current = false;
          }}
        >
          <AnimatePresence mode="wait">
            <motion.div
              key={inventoryIdx}
              initial={{
                opacity: 0,
                y: 30,
                scale: 0.96,
                filter: "blur(8px)",
              }}
              animate={{
                opacity: 1,
                y: 0,
                scale: 1,
                filter: "blur(0px)",
              }}
              exit={{
                opacity: 0,
                y: -30,
                scale: 0.96,
                filter: "blur(8px)",
              }}
              transition={{
                duration: 0.6,
                ease: [0.16, 1, 0.3, 1],
                staggerChildren: 0.1,
              }}
              className="absolute inset-0 w-full"
            >
              <FeaturedInventoryCard
                {...FEATURED_INVENTORY_ITEMS[inventoryIdx]}
              />
            </motion.div>
          </AnimatePresence>
        </div>
      </section>

      {/* ═══ 3. Sales grid ═══ */}
      <section className="bg-[#F8FAFC] px-4 py-16">
        <div className="mx-auto max-w-[1180px]">
          <ScrollReveal>
            <div className="mb-8 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="text-[26px] font-black leading-[32px] text-[#1E293B]">
                  იყიდება ბინები ბაკურიანში
                </h2>
                <p className="mt-1 text-[13px] font-medium leading-[20px] text-[#64748B]">
                  მაღალი ROI და მაქსიმალური საზღვრული საინვესტიციო აქცენტი.
                </p>
              </div>
              <div className="flex items-center gap-3">
                <Link
                  href="/create/sale"
                  className="inline-flex items-center gap-1.5 rounded-full bg-[#16A34A] px-4 py-2 text-[13px] font-bold text-white shadow-[0px_4px_10px_-2px_rgba(22,163,74,0.35)] transition-colors hover:bg-[#15803D]"
                >
                  <Plus className="size-4" />
                  დამატე
                </Link>
                <Link
                  href="/sales"
                  className="inline-flex items-center gap-1 rounded-full border border-[#16A34A] bg-white px-4 py-2 text-[13px] font-bold text-[#16A34A] hover:bg-[#F0FDF4]"
                >
                  ყველას ნახვა <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </div>
          </ScrollReveal>

          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {gridCards.map((card) => (
              <ScrollReveal key={card.id}>
                <SalePropertyCard {...card} />
              </ScrollReveal>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ 4. Q3 2024 research section ═══ */}
      <section className="px-4 py-16">
        <div className="mx-auto max-w-[1180px] rounded-[24px] border border-[#E7EEE9] bg-white p-8 shadow-[0px_4px_20px_-2px_rgba(15,61,46,0.06)] md:p-12">
          <div className="grid grid-cols-1 gap-10 lg:grid-cols-2 lg:items-center">
            <div>
              <ScrollReveal>
                <span className="mb-3 block text-[11px] font-black uppercase tracking-[1.2px] text-[#16A34A]">
                  Q3 2024 Research
                </span>
                <h2 className="text-[26px] font-black leading-[32px] text-[#1E293B] md:text-[30px] md:leading-[36px]">
                  რატომ არის ბაკურიანი საუკეთესო ინვესტიცია?
                </h2>
                <p className="mt-3 text-[14px] font-medium leading-[22px] text-[#64748B]">
                  ჩვენი უახლესი კვლევის მიხედვით, ბაკურიანში ყველაზე სარფიანი
                  ფორმატია მცირე ზომის ბინები (26-50მ²), ეს სტანდარტების 78.6%
                  იავარელი გარკვეულ შე-კოფიცატურობისთვის, საშუა წლიური ამონაგები
                  (ROI) სტაბილურად.
                </p>
              </ScrollReveal>

              <div className="mt-6 grid grid-cols-2 gap-4">
                <ResearchStat value="10-15%" label="საშუალო ROI" />
                <ResearchStat value="<$1,000" label="მინიმალური საწყისი" />
              </div>
            </div>

            <ScrollReveal delay={0.1}>
              <div className="flex flex-col items-center gap-6 lg:flex-row lg:items-start lg:justify-end lg:gap-10">
                <div className="flex flex-col items-center gap-4">
                  <span className="text-[12px] font-bold text-[#64748B]">
                    მიწოდების სტრუქტურა (ბინის ზომა)
                  </span>
                  <DonutChart
                    segments={[
                      { value: 72, color: "#16A34A", label: "მცირე ბინები" },
                      { value: 28, color: "#D1FAE5", label: "სხვა" },
                    ]}
                  />
                </div>
                <ul className="flex flex-col gap-3">
                  <li className="flex items-center gap-2 text-[13px] font-bold text-[#1E293B]">
                    <span className="size-3 rounded-sm bg-[#16A34A]" />
                    მცირე ბინები (26-50მ²)
                  </li>
                  <li className="flex items-center gap-2 text-[13px] font-bold text-[#64748B]">
                    <span className="size-3 rounded-sm bg-[#D1FAE5]" />
                    სხვა ფორმატები (&gt;50მ²)
                  </li>
                </ul>
              </div>
            </ScrollReveal>
          </div>
        </div>
      </section>
    </div>
  );
}

// ─── Hero stat card ─────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  sublabel,
  icon,
  highlight,
}: {
  label: string;
  value: string;
  sublabel?: string;
  icon?: React.ReactNode;
  highlight?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex flex-col justify-between rounded-[16px] px-5 py-4 text-left shadow-[0px_10px_15px_-3px_rgba(0,0,0,0.1)]",
        highlight
          ? "border border-white/10 bg-[#0A1F2E] text-white"
          : "border border-[#E7EEE9] bg-white text-[#1E293B]",
      )}
    >
      <div className="flex items-center gap-2">
        {icon && (
          <span
            className={cn(
              "flex size-7 items-center justify-center rounded-full",
              highlight ? "bg-white/10" : "bg-[#F0FDF4]",
            )}
          >
            {icon}
          </span>
        )}
        <span
          className={cn(
            "text-[11px] font-bold uppercase tracking-[0.55px]",
            highlight ? "text-[#CBD5E1]" : "text-[#64748B]",
          )}
        >
          {label}
        </span>
      </div>
      <div className="mt-2">
        <span
          className={cn(
            "block text-[22px] font-black leading-[28px]",
            highlight ? "text-white" : "text-[#0F172A]",
          )}
        >
          {value}
        </span>
        {sublabel && (
          <span
            className={cn(
              "mt-0.5 block text-[11px] font-medium",
              highlight ? "text-[#94A3B8]" : "text-[#94A3B8]",
            )}
          >
            {sublabel}
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Featured inventory card (horizontal full-width) ───────────────────

function FeaturedInventoryCard({
  id,
  title,
  location,
  area,
  rooms,
  description,
  priceUsd,
  roi,
  photo,
}: {
  id: string;
  title: string;
  location: string;
  area: number;
  rooms: number;
  description: string;
  priceUsd: number;
  roi: number;
  photo: string;
}) {
  return (
    <article className="overflow-hidden rounded-[24px] border border-[#E7EEE9] bg-white shadow-[0px_4px_20px_-2px_rgba(15,61,46,0.08)]">
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="relative aspect-[16/10] overflow-hidden lg:aspect-auto">
          <Image
            src={photo}
            alt={title}
            fill
            sizes="(max-width: 1024px) 100vw, 50vw"
            className="object-cover"
          />
          <span className="absolute left-4 top-4 inline-flex items-center gap-1 rounded-full bg-[#F97316] px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.6px] text-white shadow-[0px_4px_10px_-2px_rgba(249,115,22,0.45)]">
            <Sparkles className="size-3" />
            Super VIP • ექსკლუზივი
          </span>
          <span className="absolute bottom-4 left-4 rounded-full bg-[#052E16]/90 px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.6px] text-[#6EE7B7] backdrop-blur">
            გარანტირებული ROI: {roi}%
          </span>
        </div>

        <div className="flex flex-col justify-between gap-6 p-6 md:p-8">
          <div>
            <h3 className="text-[22px] font-black leading-[28px] text-[#1E293B] md:text-[26px] md:leading-[32px]">
              {title}
            </h3>
            <p className="mt-2 flex items-center gap-1.5 text-[13px] font-medium text-[#64748B]">
              <MapPin className="size-[14px] text-[#16A34A]" />
              {location}
            </p>

            <div className="mt-5 flex flex-wrap items-center gap-3">
              <div className="rounded-[12px] border border-[#E2E8F0] bg-[#F8FAFC] px-4 py-2">
                <span className="block text-[10px] font-bold uppercase tracking-[0.6px] text-[#64748B]">
                  ფართი
                </span>
                <span className="block text-[14px] font-black text-[#0F172A]">
                  {area} მ² • {rooms} ოთახი
                </span>
              </div>
              <div className="inline-flex items-center gap-1.5 rounded-[12px] border border-[#DCFCE7] bg-[#F0FDF4] px-4 py-2 text-[12px] font-bold text-[#16A34A]">
                <CheckCircle2 className="size-4" />
                დადასტურებული
              </div>
            </div>

            <p className="mt-5 text-[13px] font-medium leading-[20px] text-[#475569]">
              {description}
            </p>
          </div>

          <div className="flex items-end justify-between gap-4 border-t border-[#F1F5F9] pt-5">
            <div>
              <span className="block text-[11px] font-bold uppercase tracking-[0.6px] text-[#64748B]">
                დასაბუთი ფასი
              </span>
              <span className="block text-[28px] font-black leading-[34px] text-[#16A34A]">
                ${formatNumber(priceUsd)}
              </span>
            </div>
            <Link
              href={`/sales/${id}`}
              className="inline-flex items-center gap-1 rounded-[12px] bg-[#0A1F2E] px-5 py-3 text-[13px] font-bold text-white transition-colors hover:bg-[#0F2A40]"
            >
              დეტალები
              <ArrowRight className="size-4" />
            </Link>
          </div>
        </div>
      </div>
    </article>
  );
}

// ─── Research stat box ─────────────────────────────────────────────────

function ResearchStat({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-[16px] border border-[#DBEAFE] bg-[#EFF6FF] p-5">
      <span className="block text-[22px] font-black leading-[28px] text-[#2563EB]">
        {value}
      </span>
      <span className="mt-1 block text-[11px] font-bold uppercase tracking-[0.55px] text-[#64748B]">
        {label}
      </span>
    </div>
  );
}

// ─── Donut chart (SVG) ─────────────────────────────────────────────────

function DonutChart({
  segments,
}: {
  segments: { value: number; color: string; label: string }[];
}) {
  const total = segments.reduce((sum, s) => sum + s.value, 0) || 1;
  const radius = 62;
  const circumference = 2 * Math.PI * radius;

  let accumulated = 0;
  return (
    <svg
      viewBox="0 0 160 160"
      className="size-[170px] -rotate-90"
      aria-hidden="true"
    >
      <circle
        cx="80"
        cy="80"
        r={radius}
        fill="none"
        stroke="#F1F5F9"
        strokeWidth="20"
      />
      {segments.map((segment, i) => {
        const dash = (segment.value / total) * circumference;
        const gap = circumference - dash;
        const offset = -((accumulated / total) * circumference);
        accumulated += segment.value;
        return (
          <circle
            key={i}
            cx="80"
            cy="80"
            r={radius}
            fill="none"
            stroke={segment.color}
            strokeWidth="20"
            strokeLinecap="butt"
            strokeDasharray={`${dash} ${gap}`}
            strokeDashoffset={offset}
          />
        );
      })}
    </svg>
  );
}
