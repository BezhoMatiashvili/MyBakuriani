"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  MapPin,
  Star,
  BedDouble,
  Bath,
  Maximize,
  Eye,
  TrendingUp,
  Building2,
  Calculator,
  BadgeCheck,
  Phone,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { PhotoGallery } from "@/components/detail/PhotoGallery";
import ReviewCard from "@/components/cards/ReviewCard";
import { formatPrice } from "@/lib/utils/format";
import { createClient } from "@/lib/supabase/client";
import type { Tables } from "@/lib/types/database";

type PropertyWithOwner = Tables<"properties"> & {
  profiles: Tables<"profiles"> | null;
};

interface ReviewWithGuest {
  id: string;
  rating: number;
  comment: string | null;
  created_at: string;
  profiles: { display_name: string } | null;
}

interface Props {
  property: PropertyWithOwner;
  reviews: ReviewWithGuest[];
}

const fadeIn = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.4 },
};

export default function SaleDetailClient({ property, reviews }: Props) {
  const router = useRouter();
  const [roiYears, setRoiYears] = useState(5);

  useEffect(() => {
    const supabase = createClient();
    supabase.rpc("increment_views", { prop_id: property.id });
  }, [property.id]);

  const owner = property.profiles;
  const avgRating =
    reviews.length > 0
      ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
      : null;

  // ROI Calculator
  const salePrice = property.sale_price ?? 0;
  const roiPercent = property.roi_percent ?? 0;
  const annualReturn = salePrice * (roiPercent / 100);
  const totalReturn = annualReturn * roiYears;
  const totalValue = salePrice + totalReturn;

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:py-8">
      <motion.button
        {...fadeIn}
        onClick={() => router.back()}
        className="mb-6 flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        უკან დაბრუნება
      </motion.button>

      <motion.div {...fadeIn} transition={{ duration: 0.4, delay: 0.1 }}>
        <PhotoGallery photos={property.photos} title={property.title} />
      </motion.div>

      <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-8">
          {/* Title + meta */}
          <motion.div {...fadeIn} transition={{ duration: 0.4, delay: 0.15 }}>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="mb-2 flex items-center gap-2">
                  <span className="rounded-md bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
                    გასაყიდი
                  </span>
                  {property.is_super_vip && (
                    <span className="rounded-md bg-brand-vip-super px-2 py-0.5 text-xs font-bold text-white">
                      Super VIP
                    </span>
                  )}
                  {property.is_vip && !property.is_super_vip && (
                    <span className="rounded-md bg-brand-vip px-2 py-0.5 text-xs font-bold text-white">
                      VIP
                    </span>
                  )}
                </div>
                <h1 className="text-2xl font-black text-[#1E293B] sm:text-3xl">
                  {property.title}
                </h1>
                <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <MapPin className="h-4 w-4" />
                    {property.location}
                  </span>
                  {avgRating !== null && (
                    <span className="flex items-center gap-1">
                      <Star className="h-4 w-4 fill-brand-warning text-brand-warning" />
                      {avgRating.toFixed(1)}
                    </span>
                  )}
                  <span className="flex items-center gap-1">
                    <Eye className="h-4 w-4" />
                    {property.views_count} ნახვა
                  </span>
                </div>
              </div>
            </div>

            {/* Property specs */}
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {property.area_sqm != null && (
                <div className="rounded-xl bg-muted/50 p-4 text-center">
                  <Maximize className="mx-auto h-6 w-6 text-brand-accent" />
                  <p className="mt-2 text-lg font-bold">
                    {property.area_sqm} მ²
                  </p>
                  <p className="text-xs text-muted-foreground">ფართობი</p>
                </div>
              )}
              {property.rooms != null && (
                <div className="rounded-xl bg-muted/50 p-4 text-center">
                  <BedDouble className="mx-auto h-6 w-6 text-brand-accent" />
                  <p className="mt-2 text-lg font-bold">{property.rooms}</p>
                  <p className="text-xs text-muted-foreground">ოთახი</p>
                </div>
              )}
              {property.bathrooms != null && (
                <div className="rounded-xl bg-muted/50 p-4 text-center">
                  <Bath className="mx-auto h-6 w-6 text-brand-accent" />
                  <p className="mt-2 text-lg font-bold">{property.bathrooms}</p>
                  <p className="text-xs text-muted-foreground">სააბაზანო</p>
                </div>
              )}
              {roiPercent > 0 && (
                <div className="rounded-xl bg-emerald-50 p-4 text-center">
                  <TrendingUp className="mx-auto h-6 w-6 text-emerald-600" />
                  <p className="mt-2 text-lg font-bold text-emerald-700">
                    {roiPercent}%
                  </p>
                  <p className="text-xs text-muted-foreground">ROI</p>
                </div>
              )}
            </div>
          </motion.div>

          {/* Description */}
          {property.description && (
            <motion.div {...fadeIn} transition={{ duration: 0.4, delay: 0.2 }}>
              <h2 className="mb-3 text-lg font-black text-[#1E293B]">აღწერა</h2>
              <p className="leading-relaxed text-muted-foreground whitespace-pre-line">
                {property.description}
              </p>
            </motion.div>
          )}

          {/* Construction Status */}
          {property.construction_status && (
            <motion.div {...fadeIn} transition={{ duration: 0.4, delay: 0.25 }}>
              <h2 className="mb-3 text-lg font-black text-[#1E293B]">
                მშენებლობის სტატუსი
              </h2>
              <div className="rounded-xl border border-border p-4">
                <div className="flex items-center gap-3">
                  <Building2 className="h-6 w-6 text-brand-accent" />
                  <div>
                    <p className="font-medium text-foreground">
                      {property.construction_status}
                    </p>
                    {property.developer && (
                      <p className="text-sm text-muted-foreground">
                        დეველოპერი: {property.developer}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {/* ROI Calculator */}
          {roiPercent > 0 && salePrice > 0 && (
            <motion.div {...fadeIn} transition={{ duration: 0.4, delay: 0.3 }}>
              <h2 className="mb-3 flex items-center gap-2 text-lg font-black text-[#1E293B]">
                <Calculator className="h-5 w-5" />
                ინვესტიციის კალკულატორი
              </h2>
              <div className="rounded-xl border border-border p-6">
                <div className="mb-4">
                  <label className="mb-2 block text-sm text-muted-foreground">
                    ინვესტიციის ვადა (წელი)
                  </label>
                  <div className="flex items-center gap-3">
                    {[1, 3, 5, 10].map((y) => (
                      <button
                        key={y}
                        onClick={() => setRoiYears(y)}
                        className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                          roiYears === y
                            ? "bg-brand-accent text-white"
                            : "bg-muted text-foreground hover:bg-muted/80"
                        }`}
                      >
                        {y} წელი
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <div className="rounded-lg bg-muted/50 p-4">
                    <p className="text-xs text-muted-foreground">
                      წლიური შემოსავალი
                    </p>
                    <p className="mt-1 text-lg font-bold text-foreground">
                      {formatPrice(Math.round(annualReturn))}
                    </p>
                  </div>
                  <div className="rounded-lg bg-muted/50 p-4">
                    <p className="text-xs text-muted-foreground">
                      ჯამური შემოსავალი ({roiYears} წ.)
                    </p>
                    <p className="mt-1 text-lg font-bold text-foreground">
                      {formatPrice(Math.round(totalReturn))}
                    </p>
                  </div>
                  <div className="rounded-lg bg-emerald-50 p-4">
                    <p className="text-xs text-muted-foreground">
                      საერთო ღირებულება
                    </p>
                    <p className="mt-1 text-lg font-bold text-emerald-700">
                      {formatPrice(Math.round(totalValue))}
                    </p>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {/* Location */}
          <motion.div {...fadeIn} transition={{ duration: 0.4, delay: 0.35 }}>
            <h2 className="mb-3 text-lg font-black text-[#1E293B]">
              მდებარეობა
            </h2>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <MapPin className="h-4 w-4" />
              {property.location}
            </div>
            {property.cadastral_code && (
              <p className="mt-1 text-xs text-muted-foreground">
                საკადასტრო კოდი: {property.cadastral_code}
              </p>
            )}
          </motion.div>

          {/* Reviews */}
          {reviews.length > 0 && (
            <motion.div {...fadeIn} transition={{ duration: 0.4, delay: 0.4 }}>
              <h2 className="mb-4 text-lg font-black text-[#1E293B]">
                შეფასებები ({reviews.length})
              </h2>
              <div className="space-y-4">
                {reviews.map((review) => (
                  <ReviewCard
                    key={review.id}
                    displayName={review.profiles?.display_name ?? "ანონიმური"}
                    rating={review.rating}
                    comment={review.comment ?? ""}
                    createdAt={review.created_at}
                  />
                ))}
              </div>
            </motion.div>
          )}
        </div>

        {/* Sidebar */}
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.4, delay: 0.2 }}
        >
          <div className="sticky top-24 space-y-4">
            {/* Price card */}
            <div className="rounded-2xl bg-white p-5 shadow-sm">
              <div className="mb-1 text-sm text-muted-foreground">ფასი</div>
              <div className="text-2xl font-bold text-foreground">
                {salePrice > 0 ? formatPrice(salePrice) : "შეთანხმებით"}
              </div>
              {property.area_sqm != null && salePrice > 0 && (
                <div className="mt-1 text-sm text-muted-foreground">
                  {formatPrice(Math.round(salePrice / property.area_sqm))} / მ²
                </div>
              )}

              {property.discount_percent > 0 && (
                <div className="mt-3 rounded-lg bg-red-50 p-2 text-center text-sm font-semibold text-red-600">
                  -{property.discount_percent}% ფასდაკლება
                </div>
              )}

              <div className="my-4 border-t border-border" />

              {/* Owner */}
              <div className="mb-4 flex items-center gap-3">
                <div className="relative size-10 shrink-0 overflow-hidden rounded-full bg-muted">
                  {owner?.avatar_url ? (
                    <Image
                      src={owner.avatar_url}
                      alt={owner.display_name}
                      fill
                      className="object-cover"
                    />
                  ) : (
                    <div className="flex size-full items-center justify-center text-sm font-medium text-muted-foreground">
                      {owner?.display_name?.charAt(0) ?? "მ"}
                    </div>
                  )}
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {owner?.display_name ?? "მესაკუთრე"}
                  </p>
                  {owner?.is_verified && (
                    <div className="flex items-center gap-1 text-xs text-brand-accent">
                      <BadgeCheck className="size-3.5" />
                      ვერიფიცირებული მესაკუთრე
                    </div>
                  )}
                </div>
              </div>

              <Button
                onClick={() => router.push("/auth/login")}
                className="h-11 w-full gap-2 bg-emerald-600 text-base font-semibold text-white hover:bg-emerald-700"
              >
                <Phone className="h-4 w-4" />
                დაკავშირება
              </Button>
            </div>

            {/* Investment stats */}
            {roiPercent > 0 && (
              <div className="rounded-2xl bg-emerald-50 p-5">
                <h3 className="mb-3 text-sm font-semibold text-emerald-800">
                  საინვესტიციო მონაცემები
                </h3>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">ROI</span>
                    <span className="font-semibold text-emerald-700">
                      {roiPercent}%
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">
                      წლიური შემოსავალი
                    </span>
                    <span className="font-semibold">
                      {formatPrice(Math.round(annualReturn))}
                    </span>
                  </div>
                  {property.construction_status && (
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">სტატუსი</span>
                      <span className="font-semibold">
                        {property.construction_status}
                      </span>
                    </div>
                  )}
                  {property.developer && (
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">დეველოპერი</span>
                      <span className="font-semibold">
                        {property.developer}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </div>
  );
}
