"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { parseISO } from "date-fns";
import {
  ArrowLeft,
  MapPin,
  Star,
  Users,
  BedDouble,
  Bath,
  Maximize,
  Eye,
  UtensilsCrossed,
  CigaretteOff,
  PawPrint,
} from "lucide-react";
import dynamic from "next/dynamic";
import { useLocale, useTranslations } from "next-intl";
import { PhotoGallery } from "@/components/detail/PhotoGallery";
import { BookingSidebar } from "@/components/booking/BookingSidebar";
import { SkierLoader } from "@/components/shared/SkierLoader";
import ZoneLocationLink from "@/components/maps/ZoneLocationLink";

const BakurianiMap = dynamic(() => import("@/components/maps/BakurianiMap"), {
  ssr: false,
  loading: () => (
    <div className="flex h-[300px] items-center justify-center rounded-2xl bg-[#F1F5F9]">
      <SkierLoader variant="inline" />
    </div>
  ),
});
import { type CalendarDate } from "@/components/booking/CalendarGrid";
import { AvailabilityCalendar } from "@/components/booking/AvailabilityCalendar";
import ReviewCard from "@/components/cards/ReviewCard";
import type { Tables } from "@/lib/types/database";
import { MobileStickyCTA } from "@/components/shared/MobileStickyCTA";
import { formatPricePerNight } from "@/lib/utils/format";
import { applyDiscount } from "@/lib/utils/pricing";
import PendingReviewBanner from "@/components/listing/PendingReviewBanner";
import BannerSlot from "@/components/banners/BannerSlot";
import PropertyAmenities from "@/components/detail/PropertyAmenities";
import HostLanguages from "@/components/detail/HostLanguages";

type PropertyWithOwner = Tables<"properties"> & {
  profiles: Tables<"profiles"> | null;
  has_whatsapp?: boolean;
};

interface ReviewWithGuest {
  id: string;
  rating: number;
  comment: string | null;
  created_at: string | null;
  profiles: { display_name: string } | null;
}

interface CalendarBlock {
  date: string;
  status: string;
}

interface PriceOverrideRow {
  date: string;
  price: number;
}

interface Props {
  property: PropertyWithOwner;
  isPending?: boolean;
  reviews: ReviewWithGuest[];
  calendarBlocks: CalendarBlock[];
  priceOverrides?: PriceOverrideRow[];
}

const fadeIn = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.4 },
};

export default function HotelDetailClient({
  property,
  isPending = false,
  reviews,
  calendarBlocks,
  priceOverrides = [],
}: Props) {
  const t = useTranslations("HotelDetail");
  const tDetail = useTranslations("PropertyDetail");
  const tRules = useTranslations("HouseRules");
  const tShared = useTranslations("Shared");
  const locale = useLocale();
  const router = useRouter();
  const [selectedRange, setSelectedRange] = useState<{
    start: Date | null;
    end: Date | null;
  }>({ start: null, end: null });

  useEffect(() => {
    void fetch(`/api/listings/property/${property.id}/view`, { method: "POST" });
  }, [property.id]);

  const owner = property.profiles;
  const amenities = (property.amenities ?? []) as string[];
  const houseRulesObj = (property.house_rules ?? {}) as Record<string, unknown>;
  const smokingRule =
    typeof houseRulesObj.smoking === "boolean"
      ? (houseRulesObj.smoking as boolean)
      : null;
  const petsRule =
    typeof houseRulesObj.pets === "boolean"
      ? (houseRulesObj.pets as boolean)
      : null;
  const mealsIncludedRule =
    typeof houseRulesObj.meals_included === "boolean"
      ? (houseRulesObj.meals_included as boolean)
      : null;
  const houseRulesLabels: Record<string, string> = {
    check_in: tRules("checkIn"),
    check_out: tRules("checkOut"),
  };
  const extraHouseRules = Object.entries(houseRulesObj)
    .filter(([key]) => key in houseRulesLabels)
    .map(([key, value]) => {
      const label = houseRulesLabels[key] ?? key;
      if (typeof value === "boolean")
        return `${label}: ${value ? tRules("yes") : tRules("no")}`;
      return `${label}: ${value}`;
    });
  const showHouseRules =
    smokingRule !== null ||
    petsRule !== null ||
    mealsIncludedRule !== null ||
    extraHouseRules.length > 0;
  const avgRating =
    reviews.length > 0
      ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
      : null;

  const parsedCalendarDates = calendarBlocks.map((block) => ({
    // Parse date-only strings (YYYY-MM-DD) as LOCAL midnight. `new Date(str)`
    // would parse them as UTC midnight, which shifts the day back for viewers
    // west of UTC and makes booked dates render as available in the local-time
    // calendar grid (AvailabilityCalendar / BookingSidebar use isSameDay).
    date: parseISO(block.date),
    status: block.status as "available" | "booked" | "blocked",
  }));
  const calendarDates: CalendarDate[] = parsedCalendarDates;

  const handleDateClick = (date: Date) => {
    if (!selectedRange.start || (selectedRange.start && selectedRange.end)) {
      setSelectedRange({ start: date, end: null });
    } else {
      if (date > selectedRange.start) {
        setSelectedRange({ start: selectedRange.start, end: date });
      } else {
        setSelectedRange({ start: date, end: null });
      }
    }
  };

  const handleRangeChange = (range: {
    start: Date | null;
    end: Date | null;
  }) => {
    setSelectedRange(range);
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 pb-[calc(var(--mobile-detail-clearance)+env(safe-area-inset-bottom))] sm:py-8 lg:pb-8">
      {isPending && <PendingReviewBanner />}
      <motion.button
        {...fadeIn}
        onClick={() => router.back()}
        className="mb-6 flex items-center gap-1.5 text-sm text-[#64748B] transition-colors hover:text-[#1E293B]"
      >
        <ArrowLeft className="h-4 w-4" />
        {tShared("back")}
      </motion.button>

      <motion.div
        {...fadeIn}
        transition={{ duration: 0.4, delay: 0.1 }}
        className="mb-6"
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="mb-2 flex items-center gap-2">
              <span className="rounded-md bg-brand-accent-light px-2 py-0.5 text-xs font-medium text-brand-accent">
                {t("hotel")}
              </span>
              {property.is_super_vip && (
                <span className="rounded bg-brand-vip-super px-2 py-1 text-[10px] font-black uppercase tracking-[0.25px] text-white">
                  Super VIP
                </span>
              )}
              {property.is_vip && !property.is_super_vip && (
                <span className="rounded bg-brand-vip px-2 py-1 text-[10px] font-black uppercase tracking-[0.25px] text-white">
                  VIP
                </span>
              )}
            </div>
            <h1 className="text-[28px] font-black leading-[34px] text-[#1E293B] sm:text-[34px] sm:leading-[42px]">
              {property.title}
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-4 text-[14px] text-[#64748B]">
              <ZoneLocationLink
                location={property.location}
                lat={property.location_lat}
                lng={property.location_lng}
                className="font-medium"
                iconClassName="text-[#2563EB]"
              />
              {avgRating !== null && (
                <span className="flex items-center gap-1.5 font-bold text-[#1E293B]">
                  <Star className="h-4 w-4 fill-[#EAB308] text-[#EAB308]" />
                  {avgRating.toFixed(1)} (
                  {tDetail("reviewsCount", { count: reviews.length })})
                </span>
              )}
              <span className="flex items-center gap-1.5 font-medium">
                <Eye className="h-4 w-4" />
                {tDetail("views", { count: property.views_count ?? 0 })}
              </span>
            </div>
          </div>
        </div>
      </motion.div>

      <motion.div {...fadeIn} transition={{ duration: 0.4, delay: 0.15 }}>
        <PhotoGallery
          photos={property.photos ?? []}
          title={property.title}
          propertyId={property.id}
        />
      </motion.div>

      <div className="mt-4 grid grid-cols-1 gap-12 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-8">
          <motion.div {...fadeIn} transition={{ duration: 0.4, delay: 0.18 }}>
            {/* Quick specs — pill badges per Figma */}
            <div className="mt-4 flex flex-wrap gap-2">
              {property.rooms != null && (
                <span className="inline-flex items-center gap-1.5 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-4 py-[7px] text-[13px] font-medium text-[#334155]">
                  <BedDouble className="h-4 w-4 text-brand-accent" />
                  {t("roomsCount", { count: property.rooms })}
                </span>
              )}
              {property.bathrooms != null && (
                <span className="inline-flex items-center gap-1.5 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-4 py-[7px] text-[13px] font-medium text-[#334155]">
                  <Bath className="h-4 w-4 text-brand-accent" />
                  {tDetail("bathrooms", { count: property.bathrooms })}
                </span>
              )}
              {property.capacity != null && (
                <span className="inline-flex items-center gap-1.5 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-4 py-[7px] text-[13px] font-medium text-[#334155]">
                  <Users className="h-4 w-4 text-brand-accent" />
                  {tDetail("guests", { count: property.capacity })}
                </span>
              )}
              {property.area_sqm != null && (
                <span className="inline-flex items-center gap-1.5 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-4 py-[7px] text-[13px] font-medium text-[#334155]">
                  <Maximize className="h-4 w-4 text-brand-accent" />
                  {tDetail("areaSqm", { area: property.area_sqm })}
                </span>
              )}
            </div>
          </motion.div>

          {/* Description */}
          {property.description && (
            <motion.div {...fadeIn} transition={{ duration: 0.4, delay: 0.2 }}>
              <h2 className="mb-3 text-[20px] font-black leading-[30px] text-[#0F172A]">
                {tDetail("description")}
              </h2>
              <p className="text-[15px] font-medium leading-[27px] text-[#475569] whitespace-pre-line">
                {property.description}
              </p>
            </motion.div>
          )}

          {/* Amenities */}
          {amenities.length > 0 && (
            <motion.div {...fadeIn} transition={{ duration: 0.4, delay: 0.25 }}>
              <h2 className="mb-3 text-[20px] font-black leading-[30px] text-[#0F172A]">
                {tDetail("amenitiesTitle")}
              </h2>
              <PropertyAmenities amenities={amenities} />
            </motion.div>
          )}

          <HostLanguages value={houseRulesObj.hosting_langs} />

          {/* Location with Map */}
          <motion.div {...fadeIn} transition={{ duration: 0.4, delay: 0.3 }}>
            <h2 className="mb-3 text-[20px] font-black leading-[30px] text-[#0F172A]">
              {tDetail("exactLocation")}
            </h2>
            <p className="mb-3 flex items-center gap-1.5 text-[14px] font-medium text-[#64748B]">
              <MapPin className="h-4 w-4 shrink-0 text-[#F97316]" />
              {property.location}
            </p>
            <div className="h-[300px] overflow-hidden rounded-2xl border border-[#E2E8F0]">
              <BakurianiMap
                className="h-full w-full"
                center={
                  property.location_lat && property.location_lng
                    ? {
                        lat: Number(property.location_lat),
                        lng: Number(property.location_lng),
                      }
                    : undefined
                }
                zoom={15}
              />
            </div>
          </motion.div>

          {/* House Rules */}
          {showHouseRules && (
            <motion.div {...fadeIn} transition={{ duration: 0.4, delay: 0.33 }}>
              <h2 className="mb-3 text-[20px] font-black leading-[30px] text-[#0F172A]">
                {t("hotelRulesTitle")}
              </h2>
              {(smokingRule !== null ||
                petsRule !== null ||
                mealsIncludedRule !== null) && (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {smokingRule !== null && (
                    <HouseRuleCard
                      icon={<CigaretteOff className="h-5 w-5 text-[#EF4444]" />}
                      label={tRules("smoking")}
                      value={smokingRule}
                    />
                  )}
                  {petsRule !== null && (
                    <HouseRuleCard
                      icon={<PawPrint className="h-5 w-5 text-[#16A34A]" />}
                      label={tRules("pets")}
                      value={petsRule}
                    />
                  )}
                  {mealsIncludedRule !== null && (
                    <HouseRuleCard
                      icon={
                        <UtensilsCrossed className="h-5 w-5 text-[#F59E0B]" />
                      }
                      label={tRules("mealsIncluded")}
                      value={mealsIncludedRule}
                      trueLabel={tRules("included")}
                      falseLabel={tRules("notIncluded")}
                    />
                  )}
                </div>
              )}
              {extraHouseRules.length > 0 && (
                <ul className="mt-3 space-y-2">
                  {extraHouseRules.map((rule, i) => (
                    <li
                      key={i}
                      className="flex items-start gap-2 text-[14px] text-[#64748B]"
                    >
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-accent" />
                      {String(rule)}
                    </li>
                  ))}
                </ul>
              )}
            </motion.div>
          )}

          {/* Calendar */}
          <motion.div {...fadeIn} transition={{ duration: 0.4, delay: 0.35 }}>
            <h2 className="mb-3 text-[20px] font-black leading-[30px] text-[#0F172A]">
              {tDetail("freeDates")}
            </h2>
            <AvailabilityCalendar
              dates={calendarDates}
              selectedRange={selectedRange}
              onDateClick={handleDateClick}
            />
          </motion.div>

          {/* Reviews */}
          <motion.div {...fadeIn} transition={{ duration: 0.4, delay: 0.4 }}>
            <h2 className="mb-4 text-[20px] font-black leading-[30px] text-[#0F172A]">
              {t("reviewsTitle")} {reviews.length > 0 && `(${reviews.length})`}
            </h2>
            {reviews.length === 0 ? (
              <p className="text-sm text-[#94A3B8]">{tDetail("noReviews")}</p>
            ) : (
              <div className="space-y-8">
                {reviews.map((review) => (
                  <ReviewCard
                    key={review.id}
                    displayName={
                      review.profiles?.display_name ?? tDetail("anonymous")
                    }
                    rating={review.rating}
                    comment={review.comment ?? ""}
                    createdAt={review.created_at ?? ""}
                  />
                ))}
              </div>
            )}
          </motion.div>
        </div>

        {/* Sidebar — lg sticky offsets mirror Navbar primary (91px) + category rail (94px) */}
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.4, delay: 0.2 }}
          id="booking-sidebar"
          className="lg:sticky lg:top-[calc(91px+94px+12px)] lg:self-start lg:max-h-[calc(100vh-(91px+94px)-24px)] lg:overflow-y-auto lg:pr-1"
        >
          {property.price_per_night != null && (
            <BookingSidebar
              pricePerNight={property.price_per_night}
              minBookingDays={property.min_booking_days ?? 0}
              ownerName={owner?.display_name ?? t("hotel")}
              ownerAvatar={owner?.avatar_url ?? null}
              isOwnerVerified={owner?.is_verified ?? false}
              ownerPhone={null}
              hasWhatsapp={property.has_whatsapp ?? false}
              ownerWhatsapp={null}
              propertyId={property.id}
              selectedRange={selectedRange}
              onRangeChange={handleRangeChange}
              rating={avgRating}
              calendarDates={parsedCalendarDates}
              maxGuests={property.capacity ?? 10}
              perPersonPricing
              priceOverrides={priceOverrides}
              discountPercent={property.discount_percent}
              discountExpiresAt={property.discount_expires_at}
            />
          )}
        </motion.div>

        <BannerSlot
          placement="detail_sidebar"
          className="lg:col-start-3"
        />
      </div>

      {property.price_per_night != null && (
        <MobileStickyCTA
          primary={formatPricePerNight(
            Math.round(
              applyDiscount(
                property.price_per_night,
                property.discount_percent,
                property.discount_expires_at,
              ),
            ),
            locale,
          )}
          secondary={property.location ?? undefined}
          ctaLabel={tDetail("book")}
          onClick={() =>
            document
              .getElementById("booking-sidebar")
              ?.scrollIntoView({ behavior: "smooth", block: "start" })
          }
          tone="booking"
        />
      )}
    </div>
  );
}

function HouseRuleCard({
  icon,
  label,
  value,
  trueLabel,
  falseLabel,
}: {
  icon: React.ReactNode;
  label: string;
  value: boolean;
  trueLabel?: string;
  falseLabel?: string;
}) {
  const tRules = useTranslations("HouseRules");
  const resolvedTrue = trueLabel ?? tRules("allowed");
  const resolvedFalse = falseLabel ?? tRules("forbidden");
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-[#E2E8F0] bg-[#F8FAFC] px-4 py-3">
      <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-white shadow-sm">
        {icon}
      </div>
      <div className="flex flex-col">
        <span className="text-[11px] font-bold uppercase tracking-wider text-[#64748B]">
          {label}
        </span>
        <span className="text-[15px] font-bold leading-snug text-[#0F172A]">
          {value ? resolvedTrue : resolvedFalse}
        </span>
      </div>
    </div>
  );
}
