"use client";

import { useState, useCallback, useRef, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ArrowRight, Video, Flame } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import dynamic from "next/dynamic";

import {
  SearchBox,
  type SearchFilters,
  type ActiveDropdown,
} from "@/components/search/SearchBox";
import { SkierLoader } from "@/components/shared/SkierLoader";
import { RentBuyToggle } from "@/components/search/RentBuyToggle";
import type { MapProperty } from "@/components/maps/BakurianiMap";
import SaleLandingBody from "./SaleLandingBody";
import { useHomeListingMode } from "@/components/layout/HomeListingModeContext";

const BakurianiMap = dynamic(() => import("@/components/maps/BakurianiMap"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center bg-[#F8FAFC]">
      <SkierLoader variant="inline" />
    </div>
  ),
});
import ScrollReveal from "@/components/shared/ScrollReveal";
import PropertyCard from "@/components/cards/PropertyCard";
import ServiceCard from "@/components/cards/ServiceCard";
import EmploymentCard from "@/components/cards/EmploymentCard";
import HotOffersCarousel from "@/components/cards/HotOffersCarousel";
import { cn } from "@/lib/utils";
import { isDiscountActive } from "@/lib/utils/pricing";
import type { Tables } from "@/lib/types/database";
import { InfoBanners } from "@/components/landing/InfoBanners";
import { PromoBanners } from "@/components/landing/PromoBanners";
import type { LandingBanner } from "@/lib/banners";
import type { Zone } from "@/lib/zones/types";
import StatusCards from "@/components/landing/StatusCards";
import { AddListingButton } from "@/components/shared/AddListingButton";
import type { StatusCard } from "@/lib/status-cards/types";

interface LandingPageProps {
  zones: Zone[];
  statusCards: StatusCard[];
  hotOffers?: Tables<"properties">[];
  hotels?: Tables<"properties">[];
  saleProperties?: Tables<"properties">[];
  vipProperties?: Tables<"properties">[];
  services?: Tables<"services">[];
  blogPosts?: Tables<"blog_posts">[];
  infoBanners?: LandingBanner[];
  promoBanners?: LandingBanner[];
  pricePerSqmByZone?: Record<string, number | null>;
}

const MONTH_KEYS = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
] as const;

// ─── Component ───────────────────────────────────────────────────────────

export default function LandingPage({
  zones,
  statusCards,
  hotOffers: serverHotOffers,
  hotels: serverHotels,
  saleProperties: serverSaleProperties,
  vipProperties: serverVipProperties,
  services: serverServices,
  blogPosts: serverBlogPosts,
  infoBanners = [],
  promoBanners = [],
  pricePerSqmByZone,
}: LandingPageProps) {
  const t = useTranslations("Landing");
  const [mode, setMode] = useState<"rent" | "sale">("rent");
  const [activeDropdown, setActiveDropdown] = useState<ActiveDropdown>(null);
  const [hotOffersDiscountOnly, setHotOffersDiscountOnly] = useState(false);
  const dropdownPortalRef = useRef<HTMLDivElement>(null);
  const dropdownBoundaryRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const { setListingMode } = useHomeListingMode();

  useEffect(() => {
    setListingMode(mode);
  }, [mode, setListingMode]);

  const mapProperties = useMemo<MapProperty[]>(() => {
    const seen = new Set<string>();
    const all = [...(serverHotOffers ?? []), ...(serverHotels ?? [])];
    return all
      .filter((p) => {
        if (!p.location_lat || !p.location_lng || seen.has(p.id)) return false;
        seen.add(p.id);
        return true;
      })
      .map((p) => ({
        id: p.id,
        title: p.title,
        price: p.is_for_sale ? Number(p.sale_price) : Number(p.price_per_night),
        lat: Number(p.location_lat),
        lng: Number(p.location_lng),
        isVip: p.is_vip ?? false,
        isSuperVip: p.is_super_vip ?? false,
        photo: Array.isArray(p.photos) ? (p.photos[0] as string) : undefined,
      }));
  }, [serverHotOffers, serverHotels]);

  const handleSearch = useCallback(
    (sf: SearchFilters) => {
      const params = new URLSearchParams();
      if (sf.location) params.set("location", sf.location);
      if (sf.checkIn) params.set("check_in", sf.checkIn);
      if (sf.checkOut) params.set("check_out", sf.checkOut);
      if (sf.guests) params.set("guests", String(sf.guests));
      if (sf.keyword) params.set("q", sf.keyword);
      params.set("mode", mode);
      router.push(`/search?${params.toString()}`);
    },
    [mode, router],
  );

  // Use server data if available, otherwise fall back to mock
  const hasServerData = serverHotOffers && serverHotOffers.length > 0;

  const hotOfferCards = hasServerData
    ? serverHotOffers.map((p) => ({
        id: p.id,
        title: p.title,
        location: p.location,
        photos: p.photos ?? [],
        pricePerNight: p.price_per_night ? Number(p.price_per_night) : null,
        salePrice: p.sale_price ? Number(p.sale_price) : null,
        rating: null as number | null,
        capacity: p.capacity,
        rooms: p.rooms,
        isVip: p.is_vip ?? false,
        isSuperVip: p.is_super_vip ?? false,
        discountPercent: p.discount_percent ?? 0,
        discountExpiresAt: p.discount_expires_at ?? null,
        isForSale: p.is_for_sale ?? false,
        distanceToSlopeM: p.distance_to_slope_m,
      }))
    : [];

  const vipPropertyCards = useMemo(
    () =>
      (serverVipProperties ?? []).map((p) => ({
        id: p.id,
        title: p.title,
        location: p.location,
        photos: p.photos ?? [],
        pricePerNight: p.price_per_night ? Number(p.price_per_night) : null,
        salePrice: p.sale_price ? Number(p.sale_price) : null,
        rating: null as number | null,
        capacity: p.capacity,
        rooms: p.rooms,
        isVip: p.is_vip ?? false,
        isSuperVip: p.is_super_vip ?? false,
        discountPercent: p.discount_percent ?? 0,
        discountExpiresAt: p.discount_expires_at ?? null,
        isForSale: p.is_for_sale ?? false,
        distanceToSlopeM: p.distance_to_slope_m,
      })),
    [serverVipProperties],
  );

  const filteredVipProperties = useMemo(
    () =>
      hotOffersDiscountOnly
        ? vipPropertyCards.filter((p) =>
            isDiscountActive(p.discountPercent, p.discountExpiresAt),
          )
        : vipPropertyCards,
    [vipPropertyCards, hotOffersDiscountOnly],
  );

  const hotelCards =
    serverHotels && serverHotels.length > 0
      ? serverHotels.map((p) => ({
          id: p.id,
          title: p.title,
          location: p.location,
          photos: p.photos ?? [],
          pricePerNight: p.price_per_night ? Number(p.price_per_night) : null,
          salePrice: null as number | null,
          rating: null as number | null,
          capacity: p.capacity,
          rooms: p.rooms,
          isVip: p.is_vip ?? false,
          isSuperVip: p.is_super_vip ?? false,
          discountPercent: p.discount_percent ?? 0,
          discountExpiresAt: p.discount_expires_at ?? null,
          isForSale: false,
          isHotel: true as const,
          hotelStars: p.hotel_stars ?? undefined,
          numericRating: p.numeric_rating ?? undefined,
          isB2BPartner: p.is_b2b_partner ?? false,
          roomType: p.room_type ?? undefined,
          amenities: p.location,
        }))
      : [];

  // Group server services by category
  const servicesByCategory = (category: string) => {
    if (serverServices && serverServices.length > 0) {
      // Transport-only extras (type/seats/route) — scoped to transport so other
      // categories' cards stay unchanged.
      const isTransport = category === "transport";
      return serverServices
        .filter((s) => s.category === category)
        .slice(0, 4)
        .map((s) => ({
          id: s.id,
          title: s.title,
          category: s.category,
          location: s.location,
          photos: s.photos ?? [],
          price: s.price ? Number(s.price) : null,
          priceUnit: s.price_unit,
          discountPercent: s.discount_percent ?? 0,
          discountExpiresAt: s.discount_expires_at ?? null,
          isVip: s.is_vip ?? false,
          schedule: s.schedule,
          operatingHours: s.operating_hours,
          phone: s.phone,
          providerName: null,
          experienceYears: null,
          availabilityStatus: null,
          ...(isTransport
            ? {
                vehicleCapacity: s.vehicle_capacity,
                transportType: s.transport_type,
                route: s.route,
                routes: s.routes,
              }
            : {}),
        }));
    }
    return [];
  };

  const blogItems =
    serverBlogPosts && serverBlogPosts.length > 0
      ? serverBlogPosts.map((bp) => ({
          id: bp.id,
          title: bp.title,
          excerpt: bp.excerpt ?? "",
          image: bp.image_url ?? "/placeholder-property.jpg",
          date: (() => {
            const d = new Date(
              bp.published_at ?? bp.created_at ?? new Date().toISOString(),
            );
            return `${d.getUTCDate()} ${t(`months.${MONTH_KEYS[d.getUTCMonth()]}`)}, ${d.getUTCFullYear()}`;
          })(),
        }))
      : [];

  if (mode === "sale") {
    return (
      <SaleLandingBody
        mode={mode}
        onModeChange={setMode}
        saleProperties={serverSaleProperties}
        pricePerSqmByZone={pricePerSqmByZone}
        zones={zones}
      />
    );
  }

  return (
    <div className="flex flex-col">
      {/* ═══ 1. Hero Section ═══ */}
      <section
        className={cn(
          "relative flex min-h-[470px] items-start justify-center px-4 pb-20 pt-16 sm:min-h-0 sm:overflow-visible sm:pb-0",
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
              {t("trustedGuide")}{" "}
              <span className="text-[#38BDF8]">{t("inBakuriani")}</span>
            </h1>
          </ScrollReveal>

          <div className="mt-6 flex justify-center">
            <RentBuyToggle value={mode} onChange={setMode} />
          </div>

          <div className="relative mt-6">
            <SearchBox
              onSearch={handleSearch}
              className="shadow-[var(--shadow-search)]"
              dropdownPortalRef={dropdownPortalRef}
              dropdownBoundaryRef={dropdownBoundaryRef}
              onActiveDropdownChange={setActiveDropdown}
              zones={zones}
            />

            {/* Floating dropdown panel — absolute so it doesn't expand the blue hero */}
            {activeDropdown === "filters" ? (
              <div
                ref={dropdownBoundaryRef}
                className="absolute left-0 right-0 top-full z-30 mt-2 hidden overflow-hidden rounded-3xl border border-[#E2E8F0] bg-white shadow-[0px_25px_50px_-12px_rgba(0,0,0,0.25)] md:flex"
              >
                <div ref={dropdownPortalRef} className="min-w-0 flex-1" />
                <BakurianiMap
                  className="min-h-[400px] w-[280px] shrink-0 self-stretch"
                  embedded
                  expandable
                  properties={mapProperties}
                  onPropertyClick={(id) => router.push(`/apartments/${id}`)}
                  zones={zones}
                />
              </div>
            ) : activeDropdown === "calendar" ? (
              <div className="absolute left-0 right-0 top-full z-30 mt-2 hidden grid-cols-1 gap-4 md:grid lg:grid-cols-[1fr_auto]">
                <div ref={dropdownPortalRef} className="min-w-0" />
                <div className="flex w-full flex-col gap-3 lg:w-[240px]">
                  {/* Camera card */}
                  <div className="flex items-center rounded-[16px] border border-white/5 bg-[#222A3B] px-5 py-5 shadow-[var(--shadow-dark-card)]">
                    <div className="flex flex-col gap-1">
                      <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.55px] text-[#94A3B8]">
                        <span className="size-2 rounded-full bg-[#EF4444]" />
                        {t("cameras")}
                      </span>
                      <span className="flex items-center gap-2 text-[18px] font-black leading-[28px] text-white">
                        {t("cameraLocations")}
                        <Video className="size-[18px] text-[#CBD5E1]" />
                      </span>
                    </div>
                  </div>
                  {/* Coupon button */}
                  <button
                    type="button"
                    className="flex h-[52px] items-center justify-center rounded-[16px] border-2 border-[#E8612D] bg-[#FFF7ED] text-[14px] font-bold text-[#E8612D] transition-colors hover:bg-[#FFEDD5]"
                  >
                    {t("getCoupon")}
                  </button>
                  {/* Discount toggle */}
                  <div className="flex items-center justify-between rounded-[16px] border border-[#FFEDD5] bg-[#FFF7ED] px-4 py-3">
                    <span className="flex items-center gap-1.5 text-[12px] font-bold text-[#F97316]">
                      <Flame className="h-3.5 w-3.5" />
                      {t("discountsOnly")}
                    </span>
                    <div className="relative inline-flex h-[20px] w-[40px] cursor-pointer items-center rounded-full bg-[#F97316]">
                      <span className="absolute right-0.5 size-[16px] rounded-full bg-white shadow-sm" />
                    </div>
                  </div>
                </div>
              </div>
            ) : null}
          </div>

          {/* Rental status cards — weather / lifts / road / cameras */}
          <StatusCards cards={statusCards} className="mt-8 sm:-mb-[42px]" />
        </div>
      </section>

      {/* ═══ 2.5 Verified-listings info banner (admin-managed) ═══ */}
      <InfoBanners banners={infoBanners} />

      {/* ═══ 3. Hot Offers — VIP / Super VIP Carousel ═══ */}
      {vipPropertyCards.length > 0 && (
        <section className="mx-auto w-full max-w-[1160px] px-4 pb-16 pt-8 sm:pt-10">
          <ScrollReveal>
            <div className="mb-6 flex items-center justify-between">
              <div>
                <h2 className="text-[26px] font-black leading-[32px] text-[#1E293B]">
                  {t("hotOffers")}
                </h2>
                <p className="mt-1 text-[13px] font-medium leading-[20px] text-[#64748B]">
                  {t("verifiedOwners")}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <Link
                  href="/apartments"
                  className="inline-flex shrink-0 items-center gap-1.5 text-[13px] font-black text-[#1E293B] transition-colors hover:text-[#F97316]"
                >
                  {t("viewAll")}
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <button
                  type="button"
                  onClick={() => setHotOffersDiscountOnly((v) => !v)}
                  aria-pressed={hotOffersDiscountOnly}
                  className={cn(
                    "hidden items-center gap-3 rounded-full px-4 py-2 text-[12px] font-bold transition-colors sm:inline-flex",
                    hotOffersDiscountOnly
                      ? "border border-[#F97316]/30 bg-[#FFF7ED] text-[#F97316]"
                      : "border border-[#E2E8F0] bg-white text-[#64748B]",
                  )}
                >
                  <span className="flex items-center gap-1.5">
                    <Flame className="h-3.5 w-3.5" />
                    {t("discountsOnly")}
                  </span>
                  <span
                    className={cn(
                      "relative inline-flex h-[20px] w-[40px] items-center rounded-full transition-colors",
                      hotOffersDiscountOnly ? "bg-[#F97316]" : "bg-[#CBD5E1]",
                    )}
                  >
                    <span
                      className={cn(
                        "absolute size-[16px] rounded-full bg-white shadow-sm transition-all",
                        hotOffersDiscountOnly ? "right-0.5" : "left-0.5",
                      )}
                    />
                  </span>
                </button>
              </div>
            </div>
          </ScrollReveal>

          <ScrollReveal>
            <HotOffersCarousel properties={filteredVipProperties} />
          </ScrollReveal>
        </section>
      )}

      {/* ═══ 4. Apartments Section ═══ */}
      <PropertySection
        title={t("apartmentsAndCottages")}
        subtitle={t("apartmentsSubtitle")}
        properties={hotOfferCards.slice(0, 4)}
        href="/apartments"
        showDiscountToggle
        showAddButton
      />

      {/* ═══ 5. Hotels Section ═══ */}
      <PropertySection
        title={t("hotels")}
        subtitle={t("hotelsSubtitle")}
        properties={hotelCards}
        href="/hotels"
        muted
        showDiscountToggle
        showAddButton
      />

      {/* ═══ 5.5 Promo banners (admin-managed) ═══ */}
      <PromoBanners banners={promoBanners} />

      {/* ═══ 6. Transport Section ═══ */}
      <ServiceSection
        title={t("transportAndTransfers")}
        subtitle={t("transportSubtitle")}
        cards={servicesByCategory("transport")}
        href="/transport"
        muted
        showAddButton
      />

      {/* ═══ 7. Services Section ═══ */}
      <ServiceSection
        title={t("servicesAndHandymen")}
        subtitle={t("servicesSubtitle")}
        cards={servicesByCategory("handyman")}
        href="/services"
        showAddButton
        cardVariant="avatar"
      />

      {/* ═══ 8. Entertainment Section ═══ */}
      <ServiceSection
        title={t("entertainmentAndActivities")}
        subtitle={t("entertainmentSubtitle")}
        cards={servicesByCategory("entertainment")}
        href="/entertainment"
        muted
        showAddButton
      />

      {/* ═══ 9. Food Section ═══ */}
      <ServiceSection
        title={t("foodAndRestaurants")}
        subtitle={t("foodSubtitle")}
        cards={servicesByCategory("food")}
        href="/food"
        showAddButton
      />

      {/* ═══ 11. Employment Section ═══ */}
      <EmploymentSection
        cards={servicesByCategory("employment")}
        href="/employment"
      />

      {/* ═══ 12. Blog Section ═══ */}
      <section className="bg-brand-surface-muted px-4 py-16">
        <div className="mx-auto max-w-[1160px]">
          <ScrollReveal>
            <div className="mb-8 flex items-center justify-between">
              <h2 className="text-[26px] font-black leading-[32px] text-[#1E293B]">
                {t("blogAndNews")}
              </h2>
              <Link
                href="/blog"
                className="flex shrink-0 items-center gap-1 whitespace-nowrap text-[13px] font-bold text-[#0F172A] hover:underline"
              >
                {t("viewAll")} <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </ScrollReveal>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {blogItems.map((post, i) => {
              const chipPalette = [
                { bg: "#DBEAFE", fg: "#1D4ED8", label: t("blogChips.news") },
                { bg: "#DCFCE7", fg: "#166534", label: t("blogChips.guide") },
                { bg: "#FFEDD5", fg: "#C2410C", label: t("blogChips.season") },
              ];
              const chip = chipPalette[i % chipPalette.length];
              const fallbackPhotos = [
                "https://images.unsplash.com/photo-1551524559-8af4e6624178?w=800&h=600&fit=crop",
                "https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=800&h=600&fit=crop",
                "https://images.unsplash.com/photo-1605540436563-5bca919ae766?w=800&h=600&fit=crop",
              ];
              const imgSrc =
                post.image && post.image !== "/placeholder-property.jpg"
                  ? post.image
                  : fallbackPhotos[i % fallbackPhotos.length];
              return (
                <ScrollReveal key={post.id} delay={i * 0.1}>
                  <Link
                    href={`/blog/${post.id}`}
                    className="group block overflow-hidden rounded-[24px] border border-[#E2E8F0] bg-white shadow-[0px_4px_20px_-2px_rgba(0,0,0,0.04)] transition-shadow hover:shadow-[var(--shadow-card-hover)]"
                  >
                    <div className="relative aspect-[8/5] overflow-hidden">
                      <Image
                        src={imgSrc}
                        alt={post.title}
                        fill
                        sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                        className="object-cover transition-transform duration-300 group-hover:scale-105"
                      />
                      <span
                        className="absolute left-4 top-4 rounded-md px-2.5 py-1 text-[10px] font-black uppercase tracking-wide"
                        style={{ backgroundColor: chip.bg, color: chip.fg }}
                      >
                        {chip.label}
                      </span>
                    </div>
                    <div className="p-6">
                      <time className="text-[11px] font-medium text-[#94A3B8]">
                        {post.date}
                      </time>
                      <h3 className="mt-1 text-[17px] font-black leading-[21px] text-[#1E293B]">
                        {post.title}
                      </h3>
                      <p className="mt-2 text-[13px] leading-[21px] text-[#64748B] line-clamp-2">
                        {post.excerpt}
                      </p>
                    </div>
                  </Link>
                </ScrollReveal>
              );
            })}
          </div>
        </div>
      </section>

      {/* ═══ 13. CTA before footer ═══ */}
      <section className="px-4 py-16">
        <div className="mx-auto max-w-3xl text-center">
          <ScrollReveal>
            <h2 className="text-2xl font-black md:text-3xl">
              {t("havePropertyInBakuriani")}
            </h2>
            <p className="mt-2 text-[13px] font-medium leading-[20px] text-[#64748B]">
              {t("addListingCTA")}
            </p>
            <AddListingButton label={t("addListing")} className="mt-6 h-12 rounded-full px-8" />
          </ScrollReveal>
        </div>
      </section>
    </div>
  );
}

// ─── Reusable Section Components ─────────────────────────────────────────

function ServiceSection({
  title,
  subtitle,
  cards,
  href,
  muted,
  showDiscountToggle,
  showAddButton,
  cardVariant,
}: {
  title: string;
  subtitle?: string;
  cardVariant?: "photo" | "avatar";
  cards: Array<{
    id: string;
    title: string;
    category: string;
    location: string | null;
    photos: string[];
    price: number | null;
    priceUnit: string | null;
    discountPercent: number;
    discountExpiresAt: string | null;
    isVip: boolean;
    schedule?: string | null;
    operatingHours?: string | null;
    phone?: string | null;
    providerName?: string | null;
    experienceYears?: number | null;
    availabilityStatus?: "active" | "busy" | null;
  }>;
  href: string;
  muted?: boolean;
  showDiscountToggle?: boolean;
  showAddButton?: boolean;
}) {
  const t = useTranslations("Landing");
  const [discountOnly, setDiscountOnly] = useState(false);
  const filteredCards = useMemo(
    () =>
      discountOnly
        ? cards.filter((c) =>
            isDiscountActive(c.discountPercent, c.discountExpiresAt),
          )
        : cards,
    [cards, discountOnly],
  );
  return (
    <section className={`px-4 py-16 ${muted ? "bg-brand-surface-muted" : ""}`}>
      <div className="mx-auto max-w-[1160px]">
        <ScrollReveal>
          <div className="mb-6 flex items-center justify-between">
            <div>
              <h2 className="text-[26px] font-black leading-[32px] text-[#1E293B]">
                {title}
              </h2>
              {subtitle && (
                <p className="mt-1 text-[13px] font-medium leading-[20px] text-[#64748B]">
                  {subtitle}
                </p>
              )}
            </div>
            <div className="hidden items-center gap-4 sm:flex">
              {showDiscountToggle && (
                <button
                  type="button"
                  onClick={() => setDiscountOnly((v) => !v)}
                  aria-pressed={discountOnly}
                  className={cn(
                    "flex items-center gap-3 rounded-full px-4 py-2 text-[12px] font-bold transition-colors",
                    discountOnly
                      ? "border border-[#F97316]/30 bg-[#FFF7ED] text-[#F97316]"
                      : "border border-[#E2E8F0] bg-white text-[#64748B]",
                  )}
                >
                  <span className="flex items-center gap-1.5">
                    <Flame className="h-3.5 w-3.5" />
                    {t("discountsOnly")}
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
              )}
              {showAddButton && (
                <AddListingButton label={t("add")} className="rounded-full px-4 py-2" />
              )}
              <Link
                href={href}
                className="flex shrink-0 items-center gap-1 whitespace-nowrap text-[13px] font-bold text-[#0F172A] hover:underline"
              >
                {t("viewAll")} <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </ScrollReveal>
        <div className="scrollbar-hide -mx-4 flex gap-6 overflow-x-auto px-4 scroll-smooth snap-x">
          {filteredCards.map((card, i) => (
            <ScrollReveal key={card.id} delay={i * 0.08} className="h-full">
              <div
                className={`h-full shrink-0 snap-start ${cardVariant === "avatar" ? "w-[280px]" : "w-[300px] sm:w-[340px]"}`}
              >
                <ServiceCard {...card} variant={cardVariant} />
              </div>
            </ScrollReveal>
          ))}
        </div>
      </div>
    </section>
  );
}

function EmploymentSection({
  cards,
  href,
}: {
  cards: Array<{
    id: string;
    title: string;
    location: string | null;
    price: number | null;
    priceUnit: string | null;
  }>;
  href: string;
}) {
  const t = useTranslations("Landing");
  const postedLabels = [
    t("posted.today"),
    t("posted.daysAgo1"),
    t("posted.daysAgo3"),
    t("posted.daysAgo5"),
    t("posted.weekAgo1"),
  ];
  const availabilities = [
    t("schedule.daily"),
    t("schedule.fullTime"),
    t("schedule.flexible"),
    t("schedule.partTime"),
    t("schedule.seasonal"),
  ];

  return (
    <section className="bg-brand-surface-muted px-4 py-16">
      <div className="mx-auto max-w-[1160px]">
        <ScrollReveal>
          <div className="mb-6 flex items-center justify-between">
            <div>
              <h2 className="text-[26px] font-black leading-[32px] text-[#1E293B]">
                {t("employmentInBakuriani")}
              </h2>
              <p className="mt-1 text-[13px] font-medium leading-[20px] text-[#64748B]">
                {t("employmentSubtitle")}
              </p>
            </div>
            <div className="hidden items-center gap-4 sm:flex">
              <AddListingButton label={t("add")} className="rounded-full px-4 py-2" />
              <Link
                href={href}
                className="flex shrink-0 items-center gap-1 whitespace-nowrap text-[13px] font-bold text-[#0F172A] hover:underline"
              >
                {t("viewAll")} <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </ScrollReveal>
        <div className="scrollbar-hide -mx-4 flex snap-x gap-6 overflow-x-auto scroll-smooth px-4">
          {cards.map((card, i) => (
            <ScrollReveal key={card.id} delay={i * 0.08} className="h-full">
              <div className="h-full w-[300px] shrink-0 snap-start">
                <EmploymentCard
                  id={card.id}
                  title={card.title}
                  employer={card.location}
                  location={card.location}
                  salaryLabel={
                    card.price != null
                      ? `${card.price} ₾${card.priceUnit ? ` / ${card.priceUnit}` : ""}`
                      : null
                  }
                  scheduleLabel={availabilities[i % availabilities.length]}
                  badge={i === 0 ? "vip" : i <= 2 ? "new" : null}
                  postedLabel={postedLabels[i % postedLabels.length]}
                  highlighted={i === 0}
                />
              </div>
            </ScrollReveal>
          ))}
        </div>
      </div>
    </section>
  );
}

function PropertySection({
  title,
  subtitle,
  properties,
  href,
  muted,
  showDiscountToggle,
  showAddButton,
}: {
  title: string;
  subtitle?: string;
  properties: Array<{
    id: string;
    title: string;
    location: string;
    photos: string[];
    pricePerNight: number | null;
    salePrice: number | null;
    rating: number | null;
    capacity: number | null;
    rooms: number | null;
    isVip: boolean;
    isSuperVip: boolean;
    discountPercent: number;
    discountExpiresAt: string | null;
    isForSale: boolean;
    isHotel?: boolean;
    numericRating?: number;
    isB2BPartner?: boolean;
    hotelStars?: number;
    roomType?: string;
    amenities?: string;
    distanceToSlopeM?: number | null;
  }>;
  href: string;
  muted?: boolean;
  showDiscountToggle?: boolean;
  showAddButton?: boolean;
}) {
  const t = useTranslations("Landing");
  const [discountOnly, setDiscountOnly] = useState(false);
  const filteredProperties = useMemo(
    () =>
      discountOnly
        ? properties.filter((p) =>
            isDiscountActive(p.discountPercent, p.discountExpiresAt),
          )
        : properties,
    [properties, discountOnly],
  );
  return (
    <section className={`px-4 py-16 ${muted ? "bg-brand-surface-muted" : ""}`}>
      <div className="mx-auto max-w-[1160px]">
        <ScrollReveal>
          <div className="mb-6 flex items-center justify-between">
            <div>
              <h2 className="text-[26px] font-black leading-[32px] text-[#1E293B]">
                {title}
              </h2>
              {subtitle && (
                <p className="mt-1 text-[13px] font-medium leading-[20px] text-[#64748B]">
                  {subtitle}
                </p>
              )}
            </div>
            <div className="hidden items-center gap-4 sm:flex">
              {showDiscountToggle && (
                <button
                  type="button"
                  onClick={() => setDiscountOnly((v) => !v)}
                  aria-pressed={discountOnly}
                  className={cn(
                    "flex items-center gap-3 rounded-full px-4 py-2 text-[12px] font-bold transition-colors",
                    discountOnly
                      ? "border border-[#F97316]/30 bg-[#FFF7ED] text-[#F97316]"
                      : "border border-[#E2E8F0] bg-white text-[#64748B]",
                  )}
                >
                  <span className="flex items-center gap-1.5">
                    <Flame className="h-3.5 w-3.5" />
                    {t("discountsOnly")}
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
              )}
              {showAddButton && (
                <AddListingButton label={t("add")} className="rounded-full px-4 py-2" />
              )}
              <Link
                href={href}
                className="flex shrink-0 items-center gap-1 whitespace-nowrap text-[13px] font-bold text-[#0F172A] hover:underline"
              >
                {t("viewAll")} <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </ScrollReveal>
        <div className="scrollbar-hide -mx-4 flex gap-6 overflow-x-auto px-4 scroll-smooth snap-x">
          {filteredProperties.map((prop, i) => (
            <ScrollReveal key={prop.id} delay={i * 0.08} className="h-full">
              <div className="h-full w-[300px] shrink-0 snap-start sm:w-[340px]">
                <PropertyCard {...prop} />
              </div>
            </ScrollReveal>
          ))}
        </div>
      </div>
    </section>
  );
}
