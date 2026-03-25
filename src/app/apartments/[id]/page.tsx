"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import {
  Star,
  MapPin,
  Wifi,
  Car,
  Flame,
  Snowflake,
  Eye,
  X,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { useProperties } from "@/lib/hooks/useProperties";
import { BookingSidebar } from "@/components/booking/BookingSidebar";
import { DateRangePicker } from "@/components/booking/DateRangePicker";
import ReviewCard from "@/components/cards/ReviewCard";
import { formatPrice } from "@/lib/utils/format";
import { fadeIn } from "@/lib/utils/animations";
import { createClient } from "@/lib/supabase/client";
import type { Database } from "@/lib/types/database";

type Property = Database["public"]["Tables"]["properties"]["Row"];

const AMENITY_ICONS: Record<string, React.ReactNode> = {
  wifi: <Wifi className="size-5" />,
  parking: <Car className="size-5" />,
  fireplace: <Flame className="size-5" />,
  ski_storage: <Snowflake className="size-5" />,
};

const AMENITY_LABELS: Record<string, string> = {
  wifi: "Wi-Fi",
  parking: "პარკინგი",
  ski_storage: "სათხილამურო საწყობი",
  fireplace: "ბუხარი",
  balcony: "აივანი",
  kitchen: "სამზარეულო",
  washing_machine: "სარეცხი მანქანა",
  heating: "გათბობა",
  air_conditioning: "კონდიციონერი",
  tv: "ტელევიზორი",
};

interface Review {
  id: string;
  rating: number;
  comment: string | null;
  created_at: string;
  guest: { display_name: string } | null;
}

interface OwnerProfile {
  display_name: string;
  avatar_url: string | null;
  is_verified: boolean;
  response_time_minutes: number | null;
}

export default function ApartmentDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const { property, loading, getById } = useProperties();
  const [reviews, setReviews] = useState<Review[]>([]);
  const [owner, setOwner] = useState<OwnerProfile | null>(null);
  const [selectedRange, setSelectedRange] = useState<{
    start: Date | null;
    end: Date | null;
  }>({ start: null, end: null });
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);

  useEffect(() => {
    if (id) getById(id);
  }, [id, getById]);

  // Increment views
  useEffect(() => {
    if (!id) return;
    const supabase = createClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase.rpc as any)("increment_views", { property_id: id }).then(
      () => {},
    );
  }, [id]);

  // Fetch reviews & owner
  const fetchExtras = useCallback(async (prop: Property) => {
    const supabase = createClient();

    const [reviewsRes, ownerRes] = await Promise.all([
      supabase
        .from("reviews")
        .select(
          "id, rating, comment, created_at, guest:profiles!reviews_guest_id_fkey(display_name)",
        )
        .eq("property_id", prop.id)
        .order("created_at", { ascending: false })
        .limit(10),
      supabase
        .from("profiles")
        .select("display_name, avatar_url, is_verified, response_time_minutes")
        .eq("id", prop.owner_id)
        .single(),
    ]);

    if (reviewsRes.data) setReviews(reviewsRes.data as unknown as Review[]);
    if (ownerRes.data) setOwner(ownerRes.data);
  }, []);

  useEffect(() => {
    if (property) fetchExtras(property);
  }, [property, fetchExtras]);

  const avgRating =
    reviews.length > 0
      ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
      : null;

  const amenities = Array.isArray(property?.amenities)
    ? (property.amenities as string[])
    : [];

  const houseRules = property?.house_rules as Record<string, string> | null;

  if (loading || !property) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-8">
        <div className="animate-pulse space-y-6">
          <div className="aspect-[16/9] rounded-xl bg-muted" />
          <div className="h-8 w-2/3 rounded bg-muted" />
          <div className="h-4 w-1/3 rounded bg-muted" />
        </div>
      </div>
    );
  }

  const photos =
    property.photos.length > 0
      ? property.photos
      : ["/placeholder-property.jpg"];

  return (
    <motion.div
      variants={fadeIn}
      initial="hidden"
      animate="visible"
      className="mx-auto max-w-7xl px-4 py-8"
    >
      {/* Photo Gallery */}
      <div className="grid grid-cols-1 gap-2 md:grid-cols-4 md:grid-rows-2">
        {/* Main photo */}
        <button
          type="button"
          onClick={() => {
            setLightboxIndex(0);
            setLightboxOpen(true);
          }}
          className="relative col-span-2 row-span-2 aspect-[4/3] overflow-hidden rounded-xl md:rounded-l-xl"
        >
          <Image
            src={photos[0]}
            alt={property.title}
            fill
            className="object-cover transition-transform duration-300 hover:scale-105"
            priority
          />
        </button>

        {/* Thumbnails */}
        {photos.slice(1, 5).map((photo, i) => (
          <button
            key={i}
            type="button"
            onClick={() => {
              setLightboxIndex(i + 1);
              setLightboxOpen(true);
            }}
            className="relative hidden aspect-[4/3] overflow-hidden rounded-xl md:block"
          >
            <Image
              src={photo}
              alt={`${property.title} - ${i + 2}`}
              fill
              className="object-cover transition-transform duration-300 hover:scale-105"
            />
            {i === 3 && photos.length > 5 && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/40 text-lg font-bold text-white">
                +{photos.length - 5} ფოტო
              </div>
            )}
          </button>
        ))}
      </div>

      {/* Views count */}
      <div className="mt-3 flex items-center gap-1 text-sm text-muted-foreground">
        <Eye className="size-4" />
        {property.views_count} ნახვა
      </div>

      {/* Main content + sidebar */}
      <div className="mt-6 grid grid-cols-1 gap-8 lg:grid-cols-3">
        {/* Left content */}
        <div className="space-y-8 lg:col-span-2">
          {/* Title & location */}
          <div>
            <h1 className="text-2xl font-bold text-foreground sm:text-3xl">
              {property.title}
            </h1>
            <div className="mt-2 flex items-center gap-4 text-sm text-muted-foreground">
              <span className="flex items-center gap-1">
                <MapPin className="size-4" />
                {property.location}
              </span>
              {avgRating !== null && (
                <span className="flex items-center gap-1">
                  <Star className="size-4 fill-brand-warning text-brand-warning" />
                  {avgRating.toFixed(1)} ({reviews.length} შეფასება)
                </span>
              )}
            </div>
          </div>

          {/* Quick stats */}
          <div className="flex flex-wrap gap-4 rounded-xl bg-muted/50 p-4">
            {property.rooms != null && (
              <div className="text-center">
                <p className="text-lg font-bold text-foreground">
                  {property.rooms}
                </p>
                <p className="text-xs text-muted-foreground">ოთახი</p>
              </div>
            )}
            {property.bathrooms != null && (
              <div className="text-center">
                <p className="text-lg font-bold text-foreground">
                  {property.bathrooms}
                </p>
                <p className="text-xs text-muted-foreground">სააბაზანო</p>
              </div>
            )}
            {property.capacity != null && (
              <div className="text-center">
                <p className="text-lg font-bold text-foreground">
                  {property.capacity}
                </p>
                <p className="text-xs text-muted-foreground">სტუმარი</p>
              </div>
            )}
            {property.area_sqm != null && (
              <div className="text-center">
                <p className="text-lg font-bold text-foreground">
                  {property.area_sqm} მ²
                </p>
                <p className="text-xs text-muted-foreground">ფართობი</p>
              </div>
            )}
          </div>

          {/* Description */}
          {property.description && (
            <div>
              <h2 className="mb-3 text-lg font-semibold text-foreground">
                აღწერა
              </h2>
              <p className="whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
                {property.description}
              </p>
            </div>
          )}

          {/* Amenities */}
          {amenities.length > 0 && (
            <div>
              <h2 className="mb-4 text-lg font-semibold text-foreground">
                კეთილმოწყობა
              </h2>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {amenities.map((a) => (
                  <div
                    key={a}
                    className="flex items-center gap-3 rounded-lg bg-muted/50 p-3 text-sm text-foreground"
                  >
                    {AMENITY_ICONS[a] ?? (
                      <div className="size-5 rounded bg-muted" />
                    )}
                    {AMENITY_LABELS[a] ?? a}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* House rules */}
          {houseRules && Object.keys(houseRules).length > 0 && (
            <div>
              <h2 className="mb-3 text-lg font-semibold text-foreground">
                სახლის წესები
              </h2>
              <div className="space-y-2 rounded-xl bg-muted/50 p-4">
                {Object.entries(houseRules).map(([key, value]) => (
                  <div key={key} className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{key}</span>
                    <span className="font-medium text-foreground">{value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Location map placeholder */}
          <div>
            <h2 className="mb-3 text-lg font-semibold text-foreground">
              მდებარეობა
            </h2>
            <div className="flex aspect-[16/9] items-center justify-center rounded-xl bg-muted text-muted-foreground">
              <MapPin className="mr-2 size-5" />
              რუკა მალე დაემატება
            </div>
          </div>

          {/* Calendar */}
          <div>
            <h2 className="mb-3 text-lg font-semibold text-foreground">
              ხელმისაწვდომობა
            </h2>
            <DateRangePicker
              selectedRange={selectedRange}
              onRangeChange={setSelectedRange}
            />
          </div>

          {/* Reviews */}
          {reviews.length > 0 && (
            <div>
              <h2 className="mb-4 text-lg font-semibold text-foreground">
                შეფასებები ({reviews.length})
              </h2>
              <div className="space-y-4">
                {reviews.map((r) => (
                  <ReviewCard
                    key={r.id}
                    displayName={r.guest?.display_name ?? "სტუმარი"}
                    rating={r.rating}
                    comment={r.comment ?? ""}
                    createdAt={r.created_at}
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right sidebar — booking */}
        <div className="hidden lg:block">
          {property.price_per_night != null && owner && (
            <BookingSidebar
              pricePerNight={property.price_per_night}
              minBookingDays={property.min_booking_days}
              ownerName={owner.display_name}
              ownerAvatar={owner.avatar_url}
              isOwnerVerified={owner.is_verified}
              selectedRange={selectedRange}
              onBook={() => {}}
            />
          )}
        </div>
      </div>

      {/* Mobile booking bar */}
      {property.price_per_night != null && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background p-4 lg:hidden">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-lg font-bold text-foreground">
                {formatPrice(property.price_per_night)}
              </span>
              <span className="text-sm text-muted-foreground"> / ღამე</span>
            </div>
            <button
              type="button"
              className="rounded-lg bg-blue-600 px-6 py-3 text-sm font-semibold text-white hover:bg-blue-700"
            >
              დაჯავშნა
            </button>
          </div>
        </div>
      )}

      {/* Lightbox */}
      <AnimatePresence>
        {lightboxOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/90"
          >
            <button
              type="button"
              onClick={() => setLightboxOpen(false)}
              className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
            >
              <X className="size-6" />
            </button>

            <button
              type="button"
              onClick={() =>
                setLightboxIndex(
                  (lightboxIndex - 1 + photos.length) % photos.length,
                )
              }
              className="absolute left-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
            >
              <ChevronLeft className="size-6" />
            </button>

            <motion.div
              key={lightboxIndex}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="relative h-[80vh] w-[90vw] max-w-5xl"
            >
              <Image
                src={photos[lightboxIndex]}
                alt={`${property.title} - ${lightboxIndex + 1}`}
                fill
                className="object-contain"
              />
            </motion.div>

            <button
              type="button"
              onClick={() =>
                setLightboxIndex((lightboxIndex + 1) % photos.length)
              }
              className="absolute right-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
            >
              <ChevronRight className="size-6" />
            </button>

            <div className="absolute bottom-4 text-sm text-white/70">
              {lightboxIndex + 1} / {photos.length}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
