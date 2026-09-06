"use client";

import { useState, useCallback, useRef, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ArrowRight, Video, Flame } from "lucide-react";
import Image from "next/image";
// Locale-aware Link, not next/link: localePrefix is "as-needed", so a raw
// next/link with a locale-relative href like "/apartments" always points at the
// default-locale (ka) URL. For en/ru visitors that prefetches the wrong route and
// then pays a middleware redirect on click. This is the category nav, so it was
// the worst instance of it on the site.
import { Link } from "@/i18n/navigation";
import dynamic from "next/dynamic";

import {
  SearchBox,
  type SearchFilters,
  type ActiveDropdown,
} from "@/components/search/SearchBox";
import { buildRentSearchParams } from "@/lib/search/rentSearchQuery";
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
import BannerSlotView from "@/components/banners/BannerSlotView";
import type { BannerCreative } from "@/lib/banner-creative";
import type { Zone } from "@/lib/zones/types";
import HomeStatusCards from "@/components/landing/HomeStatusCards";
import { AddListingButton } from "@/components/shared/AddListingButton";
import type { StatusCard } from "@/lib/status-cards/types";
import { MobileRail } from "@/components/shared/MobileRail";

type PublicService = Tables<"services"> & {
  has_whatsapp?: boolean;
  best_active_menu_item_discount_percent?: number | null;
};

interface LandingPageProps {
  zones: Zone[];
  statusCards: StatusCard[];
  hotOffers?: Tables<"properties">[];
  hotels?: Tables<"properties">[];
  saleProperties?: Tables<"properties">[];
  vipProperties?: Tables<"properties">[];
  services?: PublicService[];
  blogPosts?: Tables<"blog_posts">[];
  bannerCreatives?: BannerCreative[];
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
  bannerCreatives = [],
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
  const hasHomePromo = bannerCreatives.some(
    (creative) => creative.placement === "home_promo",
  );

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
      const params = buildRentSearchParams(sf, mode);
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
        createdAt: p.created_at,
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
        createdAt: p.created_at,
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
          createdAt: p.created_at,
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
      const isFood = category === "food";
      return serverServices
        .filter((s) => s.category === category)
        .sort((a, b) => {
          const aDiscount = isFood
            ? isDiscountActive(a.best_active_menu_item_discount_percent, null)
            : isDiscountActive(a.discount_percent, a.discount_expires_at);
          const bDiscount = isFood
            ? isDiscountActive(b.best_active_menu_item_discount_percent, null)
            : isDiscountActive(b.discount_percent, b.discount_expires_at);
          if (aDiscount !== bDiscount) return aDiscount ? -1 : 1;
          if (Boolean(a.is_vip) !== Boolean(b.is_vip)) {
            return a.is_vip ? -1 : 1;
          }
          return (
            new Date(b.created_at ?? 0).getTime() -
            new Date(a.created_at ?? 0).getTime()
          );
        })
        .slice(0, 4)
        .map((s) => ({
          id: s.id,
          title: s.title,
          category: s.category,
          location: s.location,
          photos: s.photos ?? [],
          price: s.price ? Number(s.price) : null,
          priceUnit: s.price_unit,
          discountPercent: isFood
            ? (s.best_active_menu_item_discount_percent ?? 0)
            : (s.discount_percent ?? 0),
          discountExpiresAt: isFood ? null : (s.discount_expires_at ?? null),
          createdAt: s.created_at,
          isVip: s.is_vip ?? false,
          schedule: s.schedule,
          operatingHours: s.operating_hours,
          phone: null,
          hasWhatsapp: s.has_whatsapp ?? false,
          providerName: null,
          experienceYears: null,
          availabilityStatus: null,
          ...(isTransport
            ? {
                vehicleCapacity: s.vehicle_capacity,
                transportType: s.transport_type,
                vehicleMake: s.vehicle_make,
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
        bannerCreatives={bannerCreatives}
      />
    );
  }

  return (
    <div className="flex flex-col">
      {/* ═══ 1. Hero Section ═══ */}
      <section
        data-testid="homepage-hero"
        className={cn(
          "relative flex items-start justify-center px-4 pb-0 pt-10 md:pb-14 lg:pb-0 lg:pt-16",
          activeDropdown
            ? "overflow-visible"
            : "overflow-visible md:overflow-hidden lg:overflow-visible",
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
            <h1 className="text-2xl font-black leading-[1.15] tracking-[-0.7px] text-white sm:text-[32px] lg:text-[50px] lg:leading-[50px] lg:tracking-[-1.25px]">
              {t("trustedGuide")}{" "}
              <span className="text-[#38BDF8]">{t("inBakuriani")}</span>
            </h1>
          </ScrollReveal>

          <div className="mt-[34px] flex justify-center sm:mt-6">
            <RentBuyToggle
              value={mode}
              onChange={setMode}
              phoneLayout="landing-compact"
            />
          </div>

          <div className="relative mt-6">
            <SearchBox
              onSearch={handleSearch}
              className="shadow-[var(--shadow-search)]"
              dropdownPortalRef={dropdownPortalRef}
              dropdownBoundaryRef={dropdownBoundaryRef}
              onActiveDropdownChange={setActiveDropdown}
              phoneLayout="landing-compact"
              zones={zones}
            />

            {/* Floating dropdown panel — absolute so it doesn't expand the blue hero */}
            {activeDropdown === "filters" ? (
              <div
                ref={dropdownBoundaryRef}
                className="absolute left-0 right-0 top-full z-30 mt-2 hidden overflow-hidden rounded-3xl border border-[#E2E8F0] bg-white shadow-[0px_25px_50px_-12px_rgba(0,0,0,0.25)] lg:flex"
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
              <div className="absolute left-0 right-0 top-full z-30 mt-2 hidden grid-cols-[1fr_auto] gap-4 lg:grid">
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
                      <Flame className="hidden h-3.5 w-3.5 sm:block" />
                      <span className="hidden sm:inline">
                        {t("discountsOnly")}
                      </span>
                      <span className="text-[14px] font-black sm:hidden">
                        %
                      </span>
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
          <HomeStatusCards cards={statusCards} />
        </div>
      </section>

      {/* Reserve the phone-only status-card overhang in document flow. */}
      <div aria-hidden="true" className="h-[72px] sm:hidden" />

      {/* ═══ 2.5 Verified-listings info banner (admin-managed) ═══ */}
      <BannerSlotView
        placement="home_top_strip"
        creatives={bannerCreatives}
        className="mt-[70px] sm:mt-[84px]"
      />

      <BannerSlotView placement="home_hero" creatives={bannerCreatives} />

      {/* ═══ 3. Hot Offers — VIP / Super VIP Carousel ═══ */}
      {vipPropertyCards.length > 0 && (
        <section className="mx-auto w-full max-w-[1160px] px-4 pb-12 pt-[52px] sm:pt-8 lg:pb-16 lg:pt-10">
          <ScrollReveal>
            <div className="mb-6 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2
                  data-testid="homepage-hot-offers-heading"
                  className="text-[17px] font-black leading-[22px] text-[#1E293B] lg:text-[26px] lg:leading-[32px]"
                >
                  {t("hotOffers")}
                </h2>
                <p className="mt-1 text-[12px] font-medium leading-[17px] text-[#64748B] lg:text-[13px] lg:leading-[20px]">
                  {t("verifiedOwners")}
                </p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-2 sm:hidden">
                <Link
                  href="/apartments?source=hot"
                  className="flex min-h-9 items-center gap-1.5 rounded-full border border-[#E2E8F0] bg-white px-3.5 text-[12px] font-black text-[#1E293B]"
                >
                  {t("viewAll")}
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
                <button
                  type="button"
                  onClick={() => setHotOffersDiscountOnly((v) => !v)}
                  aria-pressed={hotOffersDiscountOnly}
                  aria-label={t("discountsOnly")}
                  className={cn(
                    "flex min-h-11 items-center gap-2 rounded-full px-3 py-1.5 text-[12px] font-bold transition-colors",
                    hotOffersDiscountOnly
                      ? "border border-[#F97316]/30 bg-[#FFF7ED] text-[#F97316]"
                      : "border border-[#E2E8F0] bg-white text-[#64748B]",
                  )}
                >
                  <span className="text-[14px] font-black">%</span>
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
              <div className="hidden items-center gap-3 sm:flex">
                <Link
                  href="/apartments?source=hot"
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
                    "flex items-center gap-3 rounded-full px-4 py-2 text-[12px] font-bold transition-colors",
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

      <BannerSlotView
        placement="home_between_sections"
        creatives={bannerCreatives}
      />

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

      {/* ═══ 5.5 Recommended services (admin-managed) ═══ */}
      {hasHomePromo && (
        <section
          data-testid="homepage-recommended-services"
          className="mx-auto w-full max-w-[1160px] px-4 pb-12 lg:pb-16"
        >
          <h2 className="mb-4 text-[24px] font-black leading-[30px] text-[#1E293B] lg:text-[26px] lg:leading-[32px]">
            {t("recommendedServices")}
          </h2>
          <BannerSlotView
            placement="home_promo"
            creatives={bannerCreatives}
            bare
            className="space-y-3"
          />
        </section>
      )}

      {/* ═══ 6. Transport Section ═══ */}
      <ServiceSection
        title={t("transportAndTransfers")}
        subtitle={t("transportSubtitle")}
        cards={servicesByCategory("transport")}
        href="/transport"
        muted
        showDiscountToggle
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
        showDiscountToggle
        showAddButton
      />

      {/* ═══ 9. Food Section ═══ */}
      <ServiceSection
        title={t("foodAndRestaurants")}
        subtitle={t("foodSubtitle")}
        cards={servicesByCategory("food")}
        href="/food"
        showDiscountToggle
        showAddButton
      />

      {/* ═══ 11. Employment Section ═══ */}
      <EmploymentSection
        cards={servicesByCategory("employment")}
        href="/employment"
      />

      {/* ═══ 12. Blog Section ═══ */}
      <section className="bg-brand-surface-muted px-4 py-12 lg:py-16">
        <div className="mx-auto max-w-[1160px]">
          <ScrollReveal>
            <div className="mb-8 flex items-center justify-between gap-3">
              <h2 className="text-[17px] font-black leading-[22px] text-[#1E293B] lg:text-[26px] lg:leading-[32px]">
                {t("blogAndNews")}
              </h2>
              <Link
                href="/blog"
                className="flex min-h-9 shrink-0 items-center gap-1 whitespace-nowrap rounded-full border border-[#E2E8F0] bg-white px-3.5 text-[12px] font-bold text-[#0F172A] hover:underline lg:border-none lg:bg-transparent lg:px-0 lg:text-[13px]"
              >
                {t("viewAll")} <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </ScrollReveal>
          <MobileRail
            desktopClassName="lg:mx-0 lg:grid lg:grid-cols-3 lg:gap-6 lg:overflow-visible lg:px-0 lg:pb-0 lg:snap-none"
            desktopItemClassName="lg:w-auto lg:snap-none"
          >
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
                <ScrollReveal
                  key={post.id}
                  delay={i * 0.1}
                  className="h-full md:h-auto"
                >
                  <Link
                    href={`/blog/${post.id}`}
                    data-home-blog-card
                    className="group block h-full overflow-hidden rounded-[24px] border border-[#E2E8F0] bg-white shadow-[0px_4px_20px_-2px_rgba(0,0,0,0.04)] transition-shadow hover:shadow-[var(--shadow-card-hover)] md:h-auto"
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
                    <div className="p-4 lg:p-6">
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
          </MobileRail>
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
            <AddListingButton
              label={t("addListing")}
              className="mt-6 h-12 rounded-full px-8"
            />
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
    createdAt: string | null;
    isVip: boolean;
    schedule?: string | null;
    operatingHours?: string | null;
    phone?: string | null;
    hasWhatsapp?: boolean;
    providerName?: string | null;
    experienceYears?: number | null;
    availabilityStatus?: "active" | "busy" | null;
    vehicleCapacity?: number | null;
    transportType?: string | null;
    vehicleMake?: string | null;
    route?: string | null;
    routes?: string[] | null;
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
  const discountToggle = showDiscountToggle && (
    <button
      type="button"
      onClick={() => setDiscountOnly((v) => !v)}
      aria-pressed={discountOnly}
      aria-label={t("discountsOnly")}
      className={cn(
        "flex min-h-11 items-center gap-2 rounded-full px-3 py-1.5 text-[12px] font-bold transition-colors sm:min-h-0 sm:gap-3 sm:px-4 sm:py-2",
        discountOnly
          ? "border border-[#F97316]/30 bg-[#FFF7ED] text-[#F97316]"
          : "border border-[#E2E8F0] bg-white text-[#64748B]",
      )}
    >
      <span className="flex items-center gap-1.5">
        <Flame className="hidden h-3.5 w-3.5 sm:block" />
        <span className="hidden sm:inline">{t("discountsOnly")}</span>
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
  );
  return (
    <section
      className={`px-4 py-12 lg:py-16 ${muted ? "bg-brand-surface-muted" : ""}`}
    >
      <div className="mx-auto max-w-[1160px]">
        <ScrollReveal>
          <div className="mb-6 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-[17px] font-black leading-[22px] text-[#1E293B] lg:text-[26px] lg:leading-[32px]">
                {title}
              </h2>
              {subtitle && (
                <p className="mt-1 text-[12px] font-medium leading-[17px] text-[#64748B] lg:text-[13px] lg:leading-[20px]">
                  {subtitle}
                </p>
              )}
            </div>
            <div className="flex shrink-0 flex-col items-end gap-2 lg:hidden">
              <Link
                href={href}
                className="flex min-h-9 items-center gap-1 rounded-full border border-[#E2E8F0] bg-white px-3.5 text-[12px] font-bold text-[#0F172A]"
              >
                {t("viewAll")} <ArrowRight className="size-3.5" />
              </Link>
              {discountToggle}
            </div>
            <div className="hidden items-center gap-4 lg:flex">
              {discountToggle}
              {showAddButton && (
                <AddListingButton
                  label={t("add")}
                  className="rounded-full px-4 py-2"
                />
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
        <MobileRail
          desktopClassName="lg:gap-6 lg:pb-0"
          desktopItemClassName={
            cardVariant === "avatar" ? "lg:w-[280px]" : "lg:w-[340px]"
          }
          desktopArrows
        >
          {filteredCards.map((card, i) => (
            <ScrollReveal key={card.id} delay={i * 0.08} className="h-full">
              <ServiceCard {...card} variant={cardVariant} />
            </ScrollReveal>
          ))}
        </MobileRail>
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
    createdAt: string | null;
  }>;
  href: string;
}) {
  const t = useTranslations("Landing");
  const availabilities = [
    t("schedule.daily"),
    t("schedule.fullTime"),
    t("schedule.flexible"),
    t("schedule.partTime"),
    t("schedule.seasonal"),
  ];

  return (
    <section className="bg-brand-surface-muted px-4 py-12 lg:py-16">
      <div className="mx-auto max-w-[1160px]">
        <ScrollReveal>
          <div className="mb-6 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-[17px] font-black leading-[22px] text-[#1E293B] lg:text-[26px] lg:leading-[32px]">
                {t("employmentInBakuriani")}
              </h2>
              <p className="mt-1 text-[12px] font-medium leading-[17px] text-[#64748B] lg:text-[13px] lg:leading-[20px]">
                {t("employmentSubtitle")}
              </p>
            </div>
            <Link
              href={href}
              className="flex min-h-9 shrink-0 items-center gap-1 rounded-full border border-[#E2E8F0] bg-white px-3.5 text-[12px] font-bold text-[#0F172A] lg:hidden"
            >
              {t("viewAll")} <ArrowRight className="size-3.5" />
            </Link>
            <div className="hidden items-center gap-4 lg:flex">
              <AddListingButton
                label={t("add")}
                className="rounded-full px-4 py-2"
              />
              <Link
                href={href}
                className="flex shrink-0 items-center gap-1 whitespace-nowrap text-[13px] font-bold text-[#0F172A] hover:underline"
              >
                {t("viewAll")} <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </ScrollReveal>
        <MobileRail
          desktopClassName="lg:gap-6 lg:pb-0"
          desktopItemClassName="lg:w-[300px]"
          desktopArrows
        >
          {cards.map((card, i) => (
            <ScrollReveal key={card.id} delay={i * 0.08} className="h-full">
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
                badge={i === 0 ? "vip" : null}
                createdAt={card.createdAt}
                highlighted={i === 0}
              />
            </ScrollReveal>
          ))}
        </MobileRail>
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
    createdAt: string | null;
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
  const discountToggle = showDiscountToggle && (
    <button
      type="button"
      onClick={() => setDiscountOnly((v) => !v)}
      aria-pressed={discountOnly}
      aria-label={t("discountsOnly")}
      className={cn(
        "flex min-h-11 items-center gap-2 rounded-full px-3 py-1.5 text-[12px] font-bold transition-colors sm:min-h-0 sm:gap-3 sm:px-4 sm:py-2",
        discountOnly
          ? "border border-[#F97316]/30 bg-[#FFF7ED] text-[#F97316]"
          : "border border-[#E2E8F0] bg-white text-[#64748B]",
      )}
    >
      <span className="flex items-center gap-1.5">
        <Flame className="hidden h-3.5 w-3.5 sm:block" />
        <span className="hidden sm:inline">{t("discountsOnly")}</span>
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
  );
  return (
    <section
      className={`px-4 py-12 lg:py-16 ${muted ? "bg-brand-surface-muted" : ""}`}
    >
      <div className="mx-auto max-w-[1160px]">
        <ScrollReveal>
          <div className="mb-6 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-[17px] font-black leading-[22px] text-[#1E293B] lg:text-[26px] lg:leading-[32px]">
                {title}
              </h2>
              {subtitle && (
                <p className="mt-1 text-[12px] font-medium leading-[17px] text-[#64748B] lg:text-[13px] lg:leading-[20px]">
                  {subtitle}
                </p>
              )}
            </div>
            <div className="flex shrink-0 flex-col items-end gap-2 lg:hidden">
              <Link
                href={href}
                className="flex min-h-9 items-center gap-1 rounded-full border border-[#E2E8F0] bg-white px-3.5 text-[12px] font-bold text-[#0F172A]"
              >
                {t("viewAll")} <ArrowRight className="size-3.5" />
              </Link>
              {discountToggle}
            </div>
            <div className="hidden items-center gap-4 lg:flex">
              {discountToggle}
              {showAddButton && (
                <AddListingButton
                  label={t("add")}
                  className="rounded-full px-4 py-2"
                />
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
        <MobileRail
          desktopClassName="lg:gap-6 lg:pb-0"
          desktopItemClassName="lg:w-[340px]"
          desktopArrows
        >
          {filteredProperties.map((prop, i) => (
            <ScrollReveal key={prop.id} delay={i * 0.08} className="h-full">
              <PropertyCard {...prop} />
            </ScrollReveal>
          ))}
        </MobileRail>
      </div>
    </section>
  );
}
