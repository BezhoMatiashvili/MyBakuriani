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
  Hotel,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import dynamic from "next/dynamic";
import { PhotoGallery } from "@/components/detail/PhotoGallery";
import { BookingSidebar } from "@/components/booking/BookingSidebar";
import ReviewCard from "@/components/cards/ReviewCard";
import { CalendarGrid } from "@/components/booking/CalendarGrid";
import { createClient } from "@/lib/supabase/client";

const BakurianiMap = dynamic(() => import("@/components/maps/BakurianiMap"), {
  ssr: false,
  loading: () => (
    <div className="h-[300px] animate-pulse rounded-2xl bg-[#F1F5F9]" />
  ),
});
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
    restaurant: { icon: Hotel, label: "რესტორანი" },
    heating: { icon: Flame, label: "გათბობა" },
    ac: { icon: Snowflake, label: "კონდიციონერი" },
    tv: { icon: Tv, label: "ტელევიზორი" },
    kitchen: { icon: UtensilsCrossed, label: "სამზარეულო" },
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

export default function ApartmentDetailClient({
  property,
  reviews,
  calendarBlocks,
}: Props) {
  const router = useRouter();
  const [selectedRange, setSelectedRange] = useState<{
    start: Date | null;
    end: Date | null;
  }>({ start: null, end: null });
  const [amenitiesExpanded, setAmenitiesExpanded] = useState(false);

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

  const parsedCalendarDates = calendarBlocks.map((block) => ({
    date: new Date(block.date),
    status: block.status as "available" | "booked" | "blocked",
  }));

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

      <motion.div
        {...fadeIn}
        transition={{ duration: 0.4, delay: 0.1 }}
        className="mb-6"
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-[28px] font-black leading-[34px] text-[#1E293B] sm:text-[34px] sm:leading-[42px]">
              {property.title}
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-4 text-[14px] text-[#64748B]">
              <span className="flex items-center gap-1.5 font-medium">
                <MapPin className="h-4 w-4 text-orange-500" />
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
      </motion.div>

      <motion.div {...fadeIn} transition={{ duration: 0.4, delay: 0.15 }}>
        <PhotoGallery photos={property.photos ?? []} title={property.title} />
      </motion.div>

      <motion.div
        {...fadeIn}
        transition={{ duration: 0.4, delay: 0.18 }}
        className="mt-6 flex flex-wrap gap-2"
      >
        {property.rooms != null && (
          <span className="inline-flex items-center gap-1.5 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-4 py-[7px] text-[13px] font-medium text-[#334155]">
            <BedDouble className="h-4 w-4 text-brand-accent" />
            {property.rooms} ოთახი
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
      </motion.div>

      <div className="mt-8 grid grid-cols-1 gap-12 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-8">
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
                {(amenitiesExpanded ? amenities : amenities.slice(0, 3)).map(
                  (key) => {
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
                  },
                )}
                {amenities.length > 3 && (
                  <button
                    type="button"
                    onClick={() => setAmenitiesExpanded((v) => !v)}
                    className="flex items-center gap-3 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-4 py-[7px] text-[13px] font-medium text-[#334155] transition-colors hover:bg-[#F1F5F9] hover:border-[#CBD5E1]"
                  >
                    {amenitiesExpanded ? (
                      <ChevronUp className="h-5 w-5 text-brand-accent shrink-0" />
                    ) : (
                      <ChevronDown className="h-5 w-5 text-brand-accent shrink-0" />
                    )}
                    <span>
                      {amenitiesExpanded ? "ნაკლების ჩვენება" : "ყველას ნახვა"}
                    </span>
                  </button>
                )}
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
              {property.cadastral_code && `, ${property.cadastral_code}`}
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
          {houseRules.length > 0 && (
            <motion.div {...fadeIn} transition={{ duration: 0.4, delay: 0.35 }}>
              <h2 className="mb-3 text-[20px] font-black leading-[30px] text-[#0F172A]">
                სახლის წესები
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

          {/* Available dates — inline calendar */}
          <motion.div {...fadeIn} transition={{ duration: 0.4, delay: 0.4 }}>
            <h2 className="mb-3 text-[20px] font-black leading-[30px] text-[#0F172A]">
              თავისუფალი თარიღები
            </h2>
            <div className="rounded-2xl border border-[#E2E8F0] bg-white p-5">
              <CalendarGrid
                year={new Date().getFullYear()}
                month={new Date().getMonth()}
                dates={parsedCalendarDates}
                onDateClick={() => {}}
              />
              <div className="mt-4 flex flex-wrap items-center gap-4 text-[12px] font-medium text-[#64748B]">
                <span className="flex items-center gap-2">
                  <span className="inline-block h-3 w-3 rounded-full bg-green-100" />
                  თავისუფალი
                </span>
                <span className="flex items-center gap-2">
                  <span className="inline-block h-3 w-3 rounded-full bg-red-100" />
                  დაკავებული
                </span>
                <span className="flex items-center gap-2">
                  <span className="inline-block h-3 w-3 rounded-full bg-[#2563EB]" />
                  არჩეული
                </span>
              </div>
            </div>
          </motion.div>

          {/* Reviews */}
          <motion.div {...fadeIn} transition={{ duration: 0.4, delay: 0.45 }}>
            <div className="mb-4 flex items-center gap-3">
              <span className="flex shrink-0 items-center gap-1 rounded-[12px] bg-[#0F172A] px-3 py-2 text-[14px] font-black text-white">
                <Star className="h-4 w-4 fill-[#EAB308] text-[#EAB308]" />
                {avgRating !== null ? avgRating.toFixed(1) : "—"}
              </span>
              <div>
                <h2 className="text-[20px] font-black leading-[24px] text-[#0F172A]">
                  {reviews.length} მიმოხილვა
                </h2>
                <p className="mt-1 flex items-center gap-1 text-[12px] font-bold text-[#16A34A]">
                  <span className="inline-flex h-3 w-3 items-center justify-center rounded-full border border-[#16A34A]">
                    <span className="h-1.5 w-1.5 rounded-full bg-[#16A34A]" />
                  </span>
                  დადასტურებული სტუმრების მიმოხილვები
                </p>
              </div>
            </div>
            {reviews.length === 0 ? (
              <p className="text-sm text-[#94A3B8]">ჯერ არ არის შეფასებები</p>
            ) : (
              <div className="grid gap-6 sm:grid-cols-2">
                {reviews.slice(0, 2).map((review) => (
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
            {reviews.length > 2 && (
              <button
                type="button"
                className="mt-4 rounded-xl border border-[#E2E8F0] px-5 py-2.5 text-[13px] font-bold text-[#1E293B] transition-colors hover:bg-[#F8FAFC]"
              >
                ყველა შეფასების ნახვა ({reviews.length})
              </button>
            )}
          </motion.div>
        </div>

        {/* Right sidebar */}
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.4, delay: 0.2 }}
          className="lg:sticky lg:top-[100px] lg:self-start lg:max-h-[calc(100vh-120px)] lg:overflow-y-auto lg:pr-1"
        >
          {property.price_per_night != null && (
            <BookingSidebar
              pricePerNight={property.price_per_night}
              minBookingDays={property.min_booking_days ?? 1}
              ownerName={owner?.display_name ?? "მესაკუთრე"}
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
