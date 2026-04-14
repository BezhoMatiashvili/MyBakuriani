"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  MapPin,
  Star,
  Users,
  BedDouble,
  Bath,
  Maximize,
  Eye,
  Wifi,
  Car,
  Snowflake,
  Flame,
  Tv,
  UtensilsCrossed,
  WashingMachine,
  Mountain,
  Warehouse,
  Fence,
  Waves,
  Sparkles,
} from "lucide-react";
import dynamic from "next/dynamic";
import { PhotoGallery } from "@/components/detail/PhotoGallery";
import { BookingSidebar } from "@/components/booking/BookingSidebar";

const BakurianiMap = dynamic(() => import("@/components/maps/BakurianiMap"), {
  ssr: false,
  loading: () => (
    <div className="h-[300px] animate-pulse rounded-2xl bg-[#F1F5F9]" />
  ),
});
import {
  CalendarGrid,
  type CalendarDate,
} from "@/components/booking/CalendarGrid";
import ReviewCard from "@/components/cards/ReviewCard";
import { createClient } from "@/lib/supabase/client";
import type { Tables } from "@/lib/types/database";

const AMENITY_MAP: Record<string, { icon: React.ElementType; label: string }> =
  {
    wifi: { icon: Wifi, label: "Wi-Fi" },
    parking: { icon: Car, label: "პარკინგი" },
    ski_storage: { icon: Warehouse, label: "სათხილამურო საწყობი" },
    fireplace: { icon: Flame, label: "ბუხარი" },
    balcony: { icon: Fence, label: "აივანი" },
    pool: { icon: Waves, label: "აუზი" },
    spa: { icon: Sparkles, label: "SPA" },
    restaurant: { icon: UtensilsCrossed, label: "რესტორანი" },
    heating: { icon: Flame, label: "გათბობა" },
    ac: { icon: Snowflake, label: "კონდიციონერი" },
    tv: { icon: Tv, label: "ტელევიზორი" },
    kitchen: { icon: UtensilsCrossed, label: "სამზარეულო" },
    laundry: { icon: WashingMachine, label: "სამრეცხაო" },
    washer: { icon: WashingMachine, label: "სარეცხი მანქანა" },
    mountain_view: { icon: Mountain, label: "მთის ხედი" },
  };

type PropertyWithOwner = Tables<"properties"> & {
  profiles: Tables<"profiles"> | null;
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

interface Props {
  property: PropertyWithOwner;
  reviews: ReviewWithGuest[];
  calendarBlocks: CalendarBlock[];
}

const fadeIn = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.4 },
};

export default function HotelDetailClient({
  property,
  reviews,
  calendarBlocks,
}: Props) {
  const router = useRouter();
  const [selectedRange, setSelectedRange] = useState<{
    start: Date | null;
    end: Date | null;
  }>({ start: null, end: null });

  useEffect(() => {
    const supabase = createClient();
    supabase.rpc("increment_views", { prop_id: property.id });
  }, [property.id]);

  const owner = property.profiles;
  const amenities = (property.amenities ?? []) as string[];
  const houseRulesObj = (property.house_rules ?? {}) as Record<string, unknown>;
  const houseRulesLabels: Record<string, string> = {
    smoking: "მოწევა",
    pets: "შინაური ცხოველები",
    check_in: "შესვლა",
    check_out: "გასვლა",
  };
  const houseRules = Object.entries(houseRulesObj).map(([key, value]) => {
    const label = houseRulesLabels[key] ?? key;
    if (typeof value === "boolean")
      return `${label}: ${value ? "დიახ" : "არა"}`;
    return `${label}: ${value}`;
  });
  const avgRating =
    reviews.length > 0
      ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
      : null;

  const now = new Date();
  const parsedCalendarDates = calendarBlocks.map((block) => ({
    date: new Date(block.date),
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

  const handleBook = () => {
    router.push("/auth/login");
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:py-8">
      <motion.button
        {...fadeIn}
        onClick={() => router.back()}
        className="mb-6 flex items-center gap-1.5 text-sm text-[#64748B] transition-colors hover:text-[#1E293B]"
      >
        <ArrowLeft className="h-4 w-4" />
        უკან დაბრუნება
      </motion.button>

      <motion.div {...fadeIn} transition={{ duration: 0.4, delay: 0.1 }}>
        <PhotoGallery photos={property.photos ?? []} title={property.title} />
      </motion.div>

      <div className="mt-4 grid grid-cols-1 gap-12 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-8">
          {/* Title + meta */}
          <motion.div {...fadeIn} transition={{ duration: 0.4, delay: 0.15 }}>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="mb-2 flex items-center gap-2">
                  <span className="rounded-md bg-brand-accent-light px-2 py-0.5 text-xs font-medium text-brand-accent">
                    სასტუმრო
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
                  <span className="flex items-center gap-1.5 font-medium">
                    <MapPin className="h-4 w-4 text-[#2563EB]" />
                    {property.location}
                  </span>
                  {avgRating !== null && (
                    <span className="flex items-center gap-1.5 font-bold text-[#1E293B]">
                      <Star className="h-4 w-4 fill-[#EAB308] text-[#EAB308]" />
                      {avgRating.toFixed(1)} ({reviews.length} შეფასება)
                    </span>
                  )}
                  <span className="flex items-center gap-1.5 font-medium">
                    <Eye className="h-4 w-4" />
                    {property.views_count} ნახვა
                  </span>
                </div>
              </div>
            </div>

            {/* Quick specs — pill badges per Figma */}
            <div className="mt-4 flex flex-wrap gap-2">
              {property.rooms != null && (
                <span className="inline-flex items-center gap-1.5 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-4 py-[7px] text-[13px] font-medium text-[#334155]">
                  <BedDouble className="h-4 w-4 text-brand-accent" />
                  {property.rooms} ნომერი
                </span>
              )}
              {property.bathrooms != null && (
                <span className="inline-flex items-center gap-1.5 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-4 py-[7px] text-[13px] font-medium text-[#334155]">
                  <Bath className="h-4 w-4 text-brand-accent" />
                  {property.bathrooms} სააბაზანო
                </span>
              )}
              {property.capacity != null && (
                <span className="inline-flex items-center gap-1.5 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-4 py-[7px] text-[13px] font-medium text-[#334155]">
                  <Users className="h-4 w-4 text-brand-accent" />
                  {property.capacity} სტუმარი
                </span>
              )}
              {property.area_sqm != null && (
                <span className="inline-flex items-center gap-1.5 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-4 py-[7px] text-[13px] font-medium text-[#334155]">
                  <Maximize className="h-4 w-4 text-brand-accent" />
                  {property.area_sqm} მ²
                </span>
              )}
            </div>
          </motion.div>

          {/* Description */}
          {property.description && (
            <motion.div {...fadeIn} transition={{ duration: 0.4, delay: 0.2 }}>
              <h2 className="mb-3 text-[20px] font-black leading-[30px] text-[#0F172A]">
                აღწერა
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
                კეთილმოწყობა
              </h2>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {amenities.map((key) => {
                  const amenity = AMENITY_MAP[key];
                  const Icon = amenity?.icon;
                  const label = amenity?.label ?? key;
                  return (
                    <div
                      key={key}
                      className="flex items-center gap-3 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-4 py-[7px] text-[13px] font-medium text-[#334155]"
                    >
                      {Icon && (
                        <Icon className="h-5 w-5 text-brand-accent shrink-0" />
                      )}
                      <span>{label}</span>
                    </div>
                  );
                })}
              </div>
            </motion.div>
          )}

          {/* Location with Map */}
          <motion.div {...fadeIn} transition={{ duration: 0.4, delay: 0.3 }}>
            <h2 className="mb-3 text-[20px] font-black leading-[30px] text-[#0F172A]">
              ზუსტი ლოკაცია
            </h2>
            <p className="mb-3 flex items-center gap-1.5 text-[14px] font-medium text-[#64748B]">
              <MapPin className="h-4 w-4 shrink-0 text-[#F97316]" />
              {property.location}
            </p>
            <div className="h-[300px] overflow-hidden rounded-2xl border border-[#E2E8F0]">
              <BakurianiMap className="h-full w-full" />
            </div>
          </motion.div>

          {/* House Rules */}
          {houseRules.length > 0 && (
            <motion.div {...fadeIn} transition={{ duration: 0.4, delay: 0.33 }}>
              <h2 className="mb-3 text-[20px] font-black leading-[30px] text-[#0F172A]">
                სასტუმროს წესები
              </h2>
              <ul className="space-y-2">
                {houseRules.map((rule, i) => (
                  <li
                    key={i}
                    className="flex items-start gap-2 text-[14px] text-[#64748B]"
                  >
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-accent" />
                    {String(rule)}
                  </li>
                ))}
              </ul>
            </motion.div>
          )}

          {/* Calendar */}
          <motion.div {...fadeIn} transition={{ duration: 0.4, delay: 0.35 }}>
            <h2 className="mb-3 text-[20px] font-black leading-[30px] text-[#0F172A]">
              ხელმისაწვდომობა
            </h2>
            <div className="flex items-center gap-4 mb-4 text-xs text-[#94A3B8]">
              <span className="flex items-center gap-1.5">
                <span className="h-3 w-3 rounded-sm bg-green-50 border border-green-200" />
                თავისუფალი
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-3 w-3 rounded-sm bg-red-50 border border-red-200" />
                დაკავებული
              </span>
            </div>
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              {[0, 1, 2].map((offset) => {
                const monthDate = new Date(
                  now.getFullYear(),
                  now.getMonth() + offset,
                );
                return (
                  <CalendarGrid
                    key={offset}
                    year={monthDate.getFullYear()}
                    month={monthDate.getMonth()}
                    dates={calendarDates}
                    onDateClick={handleDateClick}
                  />
                );
              })}
            </div>
          </motion.div>

          {/* Reviews */}
          <motion.div {...fadeIn} transition={{ duration: 0.4, delay: 0.4 }}>
            <h2 className="mb-4 text-[20px] font-black leading-[30px] text-[#0F172A]">
              შეფასებები {reviews.length > 0 && `(${reviews.length})`}
            </h2>
            {reviews.length === 0 ? (
              <p className="text-sm text-[#94A3B8]">ჯერ არ არის შეფასებები</p>
            ) : (
              <div className="space-y-8">
                {reviews.map((review) => (
                  <ReviewCard
                    key={review.id}
                    displayName={review.profiles?.display_name ?? "ანონიმური"}
                    rating={review.rating}
                    comment={review.comment ?? ""}
                    createdAt={review.created_at ?? ""}
                  />
                ))}
              </div>
            )}
          </motion.div>
        </div>

        {/* Sidebar */}
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.4, delay: 0.2 }}
        >
          {property.price_per_night != null && (
            <BookingSidebar
              pricePerNight={property.price_per_night}
              minBookingDays={property.min_booking_days ?? 0}
              ownerName={owner?.display_name ?? "სასტუმრო"}
              ownerAvatar={owner?.avatar_url ?? null}
              isOwnerVerified={owner?.is_verified ?? false}
              selectedRange={selectedRange}
              onRangeChange={handleRangeChange}
              onBook={handleBook}
              rating={avgRating}
              calendarDates={parsedCalendarDates}
              maxGuests={property.capacity ?? 10}
            />
          )}

          {(property.discount_percent ?? 0) > 0 && (
            <div className="mt-4 rounded-xl bg-red-50 p-4 text-center">
              <span className="text-lg font-bold text-red-600">
                -{property.discount_percent}% ფასდაკლება
              </span>
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
}
