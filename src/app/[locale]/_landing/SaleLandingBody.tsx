"use client";

import { useCallback, useMemo, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import dynamic from "next/dynamic";
import { ArrowRight, Flame, Plus } from "lucide-react";
import { Link } from "@/i18n/navigation";

import { RentBuyToggle } from "@/components/search/RentBuyToggle";
import {
  SaleSearchBox,
  type SaleSearchFilters,
} from "@/components/search/SaleSearchBox";
import SalePropertyCard from "@/components/cards/SalePropertyCard";
import { readPaymentOptions } from "@/lib/constants/sale-listing";
import ScrollReveal from "@/components/shared/ScrollReveal";
import BannerSlotView from "@/components/banners/BannerSlotView";
import type { BannerCreative } from "@/lib/banner-creative";
import { SkierLoader } from "@/components/shared/SkierLoader";
import type { MapProperty } from "@/components/maps/BakurianiMap";
import { cn } from "@/lib/utils";
import { formatNumber } from "@/lib/utils/format";
import { isDiscountActive } from "@/lib/utils/pricing";
import type { Tables } from "@/lib/types/database";
import { useHomeListingMode } from "@/components/layout/HomeListingModeContext";
import { FALLBACK_ZONES, type Zone } from "@/lib/zones/types";
import { ZoneIcon } from "@/lib/zones/icon";
import { MobileRail } from "@/components/shared/MobileRail";

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
  bannerCreatives?: BannerCreative[];
}

// Seeded zone slugs have display translations under Zones.<slug>; unknown
// (admin-created) zones fall back to their Georgian name_ka.
const TRANSLATED_ZONE_SLUGS = new Set<string>(
  FALLBACK_ZONES.map((z) => z.slug),
);

function renderZoneIcon(icon: string, zoneSlug: string, isLast: boolean) {
  return (
    <ZoneIcon
      icon={icon}
      zoneSlug={zoneSlug}
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

// ─── Component ──────────────────────────────────────────────────────────

export default function SaleLandingBody({
  mode,
  onModeChange,
  saleProperties,
  pricePerSqmByZone,
  zones,
  bannerCreatives = [],
}: SaleLandingBodyProps) {
  const t = useTranslations("Landing");
  const tZones = useTranslations("Zones");
  const router = useRouter();
  const { setListingMode } = useHomeListingMode();

  const formatPricePerSqm = (avg: number | null | undefined): string => {
    if (avg == null || !Number.isFinite(avg)) return "—";
    return t("sale.pricePerSqm", { price: formatNumber(avg) });
  };

  useEffect(() => {
    setListingMode(mode);
  }, [mode, setListingMode]);

  const [showMap, setShowMap] = useState(false);
  const [discountOnly, setDiscountOnly] = useState(false);

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
      if (sf.rooms.length) params.set("rooms", sf.rooms.join(","));
      if (sf.areaMin > 0) params.set("area_min", String(sf.areaMin));
      if (sf.areaMax > 0 && sf.areaMax < 500)
        params.set("area_max", String(sf.areaMax));
      if (sf.payment.length) params.set("payment", sf.payment.join(","));
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
        type: p.type,
        area: p.area_sqm ?? null,
        rooms: p.rooms,
        // estimatedRoi is synthetic (derived from the id), so nulling
        // roi_percent in the DB does not suppress it — a bare plot has no
        // rental yield, so skip it here.
        roi: p.type === "land" ? undefined : estimatedRoi(p.id),
        constructionStatus: p.construction_status ?? null,
        constructionProgressPercent: p.construction_progress_percent ?? null,
        discountPercent: p.discount_percent ?? 0,
        discountExpiresAt: p.discount_expires_at ?? null,
        createdAt: p.created_at,
        paymentOptions: readPaymentOptions(p.house_rules),
      }));
    }
    return [];
  }, [saleProperties]);

  const gridCards = useMemo(
    () =>
      (discountOnly
        ? saleCards.filter((card) =>
            isDiscountActive(card.discountPercent, card.discountExpiresAt),
          )
        : saleCards
      ).slice(0, 3),
    [discountOnly, saleCards],
  );

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
        data-testid="homepage-hero"
        className="relative flex items-start justify-center px-4 pb-14 pt-10 lg:min-h-[620px] lg:pb-16 lg:pt-16"
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
            <h1 className="text-[28px] font-black leading-[1.08] tracking-[-0.7px] text-white sm:text-[36px] lg:text-[64px] lg:leading-[68px] lg:tracking-[-1.25px]">
              {t("sale.heroTitleTop")}
              <br />
              <span className="text-[#6EE7B7]">
                {t("sale.heroTitleHighlight")}
              </span>
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

          {/* Stat cards — sit below the search box, overhang the hero bottom (matches rental landing) */}
          <div
            className={cn(
              "scrollbar-hide -mx-4 mt-8 flex snap-x snap-mandatory gap-4 overflow-x-auto overscroll-x-contain scroll-px-4 px-4 sm:mx-0 sm:grid sm:grid-cols-4 sm:overflow-visible sm:px-0",
              !showMap && "sm:-mb-[42px]",
            )}
          >
            {zones.map((zone, i) => (
              <StatCard
                key={zone.id}
                label={
                  TRANSLATED_ZONE_SLUGS.has(zone.slug)
                    ? tZones(`${zone.slug}.name`)
                    : zone.name_ka
                }
                // pricePerSqmByZone is keyed by the DB name_ka — keep as-is.
                value={formatPricePerSqm(pricePerSqmByZone?.[zone.name_ka])}
                icon={renderZoneIcon(
                  zone.icon,
                  zone.slug,
                  i === zones.length - 1,
                )}
                highlight={i === zones.length - 1}
              />
            ))}
          </div>
        </div>
      </section>

      {/* ═══ Inline map (toggled by the map button in SaleSearchBox) ═══ */}
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

      <BannerSlotView placement="home_top_strip" creatives={bannerCreatives} />

      <BannerSlotView placement="home_hero" creatives={bannerCreatives} />

      {/* ═══ Sales grid ═══ */}
      <section className="bg-[#F8FAFC] px-4 py-12 lg:py-16">
        <div className="mx-auto max-w-[1180px]">
          <ScrollReveal>
            <div className="mb-8 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="text-[17px] font-black leading-[22px] text-[#1E293B] lg:text-[26px] lg:leading-[32px]">
                  {t("sale.forSaleTitle")}
                </h2>
                <p className="mt-1 text-[12px] font-medium leading-[17px] text-[#64748B] lg:text-[13px] lg:leading-[20px]">
                  {t("sale.forSaleSubtitle")}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => setDiscountOnly((value) => !value)}
                  aria-pressed={discountOnly}
                  aria-label={t("discountsOnly")}
                  className={cn(
                    "flex min-h-11 items-center gap-2 rounded-full px-3 py-1.5 text-[12px] font-bold transition-colors sm:gap-3 sm:px-4 sm:py-2 lg:min-h-0",
                    discountOnly
                      ? "border border-[#F97316]/30 bg-[#FFF7ED] text-[#F97316]"
                      : "border border-[#E2E8F0] bg-white text-[#64748B]",
                  )}
                >
                  <span className="flex items-center gap-1.5">
                    <Flame className="hidden h-3.5 w-3.5 sm:block" />
                    <span className="hidden sm:inline">
                      {t("discountsOnly")}
                    </span>
                    <span className="text-[14px] font-black sm:hidden">%</span>
                  </span>
                  <span
                    className={cn(
                      "relative inline-flex h-[20px] w-[40px] items-center rounded-full transition-colors",
                      discountOnly ? "bg-[#F97316]" : "bg-[#CBD5E1]",
                    )}
                  >
                    <span
                      className={cn(
                        "absolute size-[16px] rounded-full bg-white shadow-sm transition-all",
                        discountOnly ? "right-0.5" : "left-0.5",
                      )}
                    />
                  </span>
                </button>
                <Link
                  href="/create/sale"
                  className="hidden items-center gap-1.5 rounded-full bg-[#16A34A] px-4 py-2 text-[13px] font-bold text-white shadow-[0px_4px_10px_-2px_rgba(22,163,74,0.35)] transition-colors hover:bg-[#15803D] lg:inline-flex"
                >
                  <Plus className="size-4" />
                  {t("sale.add")}
                </Link>
                <Link
                  href="/sales"
                  className="inline-flex min-h-11 items-center gap-1 rounded-full border border-[#16A34A] bg-white px-4 py-2 text-[13px] font-bold text-[#16A34A] hover:bg-[#F0FDF4] lg:min-h-0"
                >
                  {t("sale.viewAll")} <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </div>
          </ScrollReveal>

          <MobileRail
            desktopClassName="lg:mx-0 lg:grid lg:grid-cols-3 lg:gap-6 lg:overflow-visible lg:px-0 lg:pb-0 lg:snap-none"
            desktopItemClassName="lg:w-auto lg:snap-none"
          >
            {gridCards.map((card) => (
              <ScrollReveal key={card.id}>
                <SalePropertyCard {...card} />
              </ScrollReveal>
            ))}
          </MobileRail>
        </div>
      </section>

      {/* ═══ 4. Q3 2024 research section ═══ */}
      <section className="px-4 py-16">
        <div className="mx-auto max-w-[1180px] rounded-[24px] border border-[#E7EEE9] bg-white p-8 shadow-[0px_4px_20px_-2px_rgba(15,61,46,0.06)] md:p-12">
          <div className="grid grid-cols-1 gap-10 lg:grid-cols-2 lg:items-center">
            <div>
              <ScrollReveal>
                <span className="mb-3 block text-[11px] font-black uppercase tracking-[1.2px] text-[#16A34A]">
                  {t("sale.researchEyebrow")}
                </span>
                <h2 className="text-[26px] font-black leading-[32px] text-[#1E293B] md:text-[30px] md:leading-[36px]">
                  {t("sale.whyInvest")}
                </h2>
                <p className="mt-3 text-[14px] font-medium leading-[22px] text-[#64748B]">
                  {t("sale.researchBody")}
                </p>
              </ScrollReveal>

              <div className="mt-6 grid grid-cols-2 gap-4">
                <ResearchStat value="10-15%" label={t("sale.avgRoi")} />
                <ResearchStat value="<$1,000" label={t("sale.minInitial")} />
              </div>
            </div>

            <ScrollReveal delay={0.1}>
              <div className="flex flex-col items-center gap-6 lg:flex-row lg:items-start lg:justify-end lg:gap-10">
                <div className="flex flex-col items-center gap-4">
                  <span className="text-[12px] font-bold text-[#64748B]">
                    {t("sale.supplyStructure")}
                  </span>
                  <DonutChart
                    segments={[
                      {
                        value: 72,
                        color: "#16A34A",
                        label: t("sale.smallApartments"),
                      },
                      { value: 28, color: "#D1FAE5", label: t("sale.other") },
                    ]}
                  />
                </div>
                <ul className="flex flex-col gap-3">
                  <li className="flex items-center gap-2 text-[13px] font-bold text-[#1E293B]">
                    <span className="size-3 rounded-sm bg-[#16A34A]" />
                    {t("sale.smallApartmentsLegend")}
                  </li>
                  <li className="flex items-center gap-2 text-[13px] font-bold text-[#64748B]">
                    <span className="size-3 rounded-sm bg-[#D1FAE5]" />
                    {t("sale.otherFormatsLegend")}
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
        "flex w-[min(260px,calc(100vw-64px))] shrink-0 snap-start flex-col justify-between rounded-[16px] px-5 py-4 text-left shadow-[0px_10px_15px_-3px_rgba(0,0,0,0.1)] sm:w-auto",
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
