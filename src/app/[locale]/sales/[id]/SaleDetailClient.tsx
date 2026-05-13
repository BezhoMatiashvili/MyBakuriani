"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import dynamic from "next/dynamic";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  MapPin,
  Star,
  BedDouble,
  Bath,
  Maximize,
  Eye,
  BadgeCheck,
  Phone,
  MessageSquare,
  Check,
  X,
  ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { PhotoGallery } from "@/components/detail/PhotoGallery";
import ReviewCard from "@/components/cards/ReviewCard";
import { formatPrice } from "@/lib/utils/format";
import { createClient } from "@/lib/supabase/client";
import type { Tables } from "@/lib/types/database";
import { SkierLoader } from "@/components/shared/SkierLoader";
import { MobileStickyCTA } from "@/components/shared/MobileStickyCTA";

const BakurianiMap = dynamic(() => import("@/components/maps/BakurianiMap"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full min-h-[320px] w-full items-center justify-center rounded-[20px] bg-[#F8FAFC]">
      <SkierLoader variant="inline" />
    </div>
  ),
});

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

interface Props {
  property: PropertyWithOwner;
  reviews: ReviewWithGuest[];
}

const fadeIn = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.4 },
};

const CONSTRUCTION_MILESTONES: Array<{ label: string; pctThreshold: number }> =
  [
    { label: "მშენებლობის ნებართვა", pctThreshold: 5 },
    { label: "საფუძვლის მოწყობა", pctThreshold: 15 },
    { label: "კარკასი", pctThreshold: 30 },
    { label: "სახურავი", pctThreshold: 45 },
    { label: "კომუნიკაციები", pctThreshold: 60 },
    { label: "გარე მოპირკეთება", pctThreshold: 75 },
    { label: "შიდა მოპირკეთება", pctThreshold: 90 },
    { label: "დასრულება", pctThreshold: 100 },
  ];

export default function SaleDetailClient({ property, reviews }: Props) {
  const router = useRouter();
  const [isConstructionModalOpen, setConstructionModalOpen] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    supabase.rpc("increment_views", { prop_id: property.id });
  }, [property.id]);

  useEffect(() => {
    if (!isConstructionModalOpen) return;
    document.body.style.overflow = "hidden";
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setConstructionModalOpen(false);
    };
    window.addEventListener("keydown", handleKey);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", handleKey);
    };
  }, [isConstructionModalOpen]);

  const owner = property.profiles;
  const avgRating =
    reviews.length > 0
      ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
      : null;

  const salePrice = property.sale_price ?? 0;
  const roiPercent = property.roi_percent ?? 0;
  const annualReturn = salePrice * (roiPercent / 100);

  const postedAgo = (() => {
    if (!property.created_at) return null;
    const diffMs = Date.now() - new Date(property.created_at).getTime();
    const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    if (days <= 0) return "განთავსებულია დღეს";
    if (days === 1) return "განთავსებულია 1 დღის წინ";
    return `განთავსებულია ${days} დღის წინ`;
  })();

  const constructionPct = (() => {
    const status = property.construction_status?.toLowerCase() ?? "";
    if (status.includes("complete") || status.includes("დასრულ")) return 100;
    if (status.includes("finish") || status.includes("მოპირკ")) return 85;
    if (status.includes("interior") || status.includes("შიდა")) return 75;
    if (status.includes("exterior") || status.includes("გარე")) return 60;
    if (status.includes("progress") || status.includes("მიმდინარე")) return 45;
    if (status.includes("foundation") || status.includes("საფუძვ")) return 15;
    if (property.construction_status) return 45;
    return 0;
  })();

  const heroPhoto =
    Array.isArray(property.photos) && property.photos.length > 0
      ? (property.photos[0] as string)
      : "/placeholder-property.jpg";

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 pb-[88px] sm:py-8 md:pb-8">
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
              {postedAgo && <span className="font-medium">{postedAgo}</span>}
              {avgRating !== null && (
                <span className="flex items-center gap-1.5 font-bold text-[#1E293B]">
                  <Star className="h-4 w-4 fill-[#EAB308] text-[#EAB308]" />
                  {avgRating.toFixed(1)}
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
        className="mt-6 flex flex-wrap items-center gap-2"
      >
        {property.area_sqm != null && (
          <span className="inline-flex items-center gap-1.5 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-4 py-[7px] text-[13px] font-medium text-[#334155]">
            <Maximize className="h-4 w-4 text-brand-accent" />
            {property.area_sqm} მ²
          </span>
        )}
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
        <span className="ms-auto text-xs text-[#94A3B8]">
          ID: {property.id.slice(0, 8)}
        </span>
      </motion.div>

      <div className="mt-8 grid grid-cols-1 gap-12 lg:grid-cols-3">
        <div className="space-y-8 lg:col-span-2">
          <motion.div {...fadeIn} transition={{ duration: 0.4, delay: 0.18 }}>
            <h2 className="mb-3 text-[20px] font-black leading-[30px] text-[#0F172A]">
              საინვესტიციო მეტრიკები და სტატუსი
            </h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {property.rooms != null && (
                <div className="rounded-[14px] border border-[#E2E8F0] bg-white p-4">
                  <p className="text-[11px] font-bold uppercase tracking-[0.5px] text-[#94A3B8]">
                    ოთახები
                  </p>
                  <p className="mt-1 text-[15px] font-black text-[#1E293B]">
                    {property.rooms} ოთახიანი
                  </p>
                </div>
              )}
              {property.area_sqm != null && (
                <div className="rounded-[14px] border border-[#E2E8F0] bg-white p-4">
                  <p className="text-[11px] font-bold uppercase tracking-[0.5px] text-[#94A3B8]">
                    ფართობი
                  </p>
                  <p className="mt-1 text-[15px] font-black text-[#1E293B]">
                    {property.area_sqm} მ²
                  </p>
                </div>
              )}
              {property.bathrooms != null && (
                <div className="rounded-[14px] border border-[#E2E8F0] bg-white p-4">
                  <p className="text-[11px] font-bold uppercase tracking-[0.5px] text-[#94A3B8]">
                    სააბაზანო
                  </p>
                  <p className="mt-1 text-[15px] font-black text-[#1E293B]">
                    {property.bathrooms}
                  </p>
                </div>
              )}
              {property.construction_status && (
                <div className="rounded-[14px] border border-[#E2E8F0] bg-white p-4">
                  <p className="text-[11px] font-bold uppercase tracking-[0.5px] text-[#94A3B8]">
                    სტატუსი
                  </p>
                  <p className="mt-1 text-[15px] font-black text-[#16A34A]">
                    {property.construction_status}
                  </p>
                </div>
              )}
              {property.developer && (
                <div className="rounded-[14px] border border-[#E2E8F0] bg-white p-4">
                  <p className="text-[11px] font-bold uppercase tracking-[0.5px] text-[#94A3B8]">
                    დეველოპერი
                  </p>
                  <p className="mt-1 text-[15px] font-black text-[#1E293B]">
                    {property.developer}
                  </p>
                </div>
              )}
              {property.cadastral_code && (
                <div className="rounded-[14px] border border-[#E2E8F0] bg-white p-4">
                  <p className="text-[11px] font-bold uppercase tracking-[0.5px] text-[#94A3B8]">
                    საკადასტრო კოდი
                  </p>
                  <p className="mt-1 truncate text-[15px] font-black text-[#1E293B]">
                    {property.cadastral_code}
                  </p>
                </div>
              )}
              {roiPercent > 0 && (
                <div className="rounded-[14px] border border-[#DCFCE7] bg-[#F0FDF4] p-4">
                  <p className="text-[11px] font-bold uppercase tracking-[0.5px] text-[#16A34A]">
                    ROI
                  </p>
                  <p className="mt-1 text-[15px] font-black text-[#15803D]">
                    {roiPercent}%
                  </p>
                </div>
              )}
            </div>
          </motion.div>

          {property.description && (
            <motion.div {...fadeIn} transition={{ duration: 0.4, delay: 0.2 }}>
              <h2 className="mb-3 text-[20px] font-black leading-[30px] text-[#0F172A]">
                ბინის შესახებ
              </h2>
              <p className="whitespace-pre-line text-[15px] font-medium leading-[27px] text-[#475569]">
                {property.description}
              </p>
            </motion.div>
          )}

          {property.construction_status && (
            <motion.div {...fadeIn} transition={{ duration: 0.4, delay: 0.25 }}>
              <h2 className="mb-3 text-[20px] font-black leading-[30px] text-[#0F172A]">
                მშენებლობის პროცესი
              </h2>
              <div className="overflow-hidden rounded-[20px] border border-[#E2E8F0] bg-white">
                <div className="grid grid-cols-1 md:grid-cols-[180px_1fr]">
                  <div className="relative aspect-[4/3] md:aspect-auto md:h-full">
                    <Image
                      src={heroPhoto}
                      alt={property.title}
                      fill
                      sizes="(max-width: 768px) 100vw, 180px"
                      className="object-cover"
                    />
                  </div>
                  <div className="flex flex-col gap-4 p-5">
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-[0.5px] text-[#94A3B8]">
                        {property.developer ?? "მშენებელი კომპანია"}
                      </p>
                      <p className="mt-0.5 text-[15px] font-black text-[#1E293B]">
                        {property.title}
                      </p>
                    </div>
                    <div>
                      <div className="mb-1.5 flex items-center justify-between text-[12px]">
                        <span className="font-bold text-[#64748B]">
                          {property.construction_status}
                        </span>
                        <span className="font-black text-[#16A34A]">
                          {constructionPct}%
                        </span>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-[#F1F5F9]">
                        <div
                          className="h-full rounded-full bg-[#16A34A] transition-all duration-500"
                          style={{ width: `${constructionPct}%` }}
                        />
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setConstructionModalOpen(true)}
                      className="group flex items-center justify-between rounded-[12px] border border-[#E2E8F0] bg-[#F8FAFC] px-4 py-3 text-[13px] font-bold text-[#1E293B] transition-colors hover:border-[#16A34A] hover:bg-[#F0FDF4]"
                    >
                      მშენებლობის პროცესი
                      <ArrowRight className="size-4 text-[#64748B] transition-colors group-hover:text-[#16A34A]" />
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          <motion.div {...fadeIn} transition={{ duration: 0.4, delay: 0.35 }}>
            <h2 className="mb-3 text-[20px] font-black leading-[30px] text-[#0F172A]">
              ზუსტი ლოკაცია
            </h2>
            <div className="mb-3 flex items-center gap-2 text-[14px] font-medium text-[#64748B]">
              <MapPin className="h-4 w-4 text-orange-500" />
              {property.location}
              {property.cadastral_code && (
                <span className="ml-auto text-xs text-[#94A3B8]">
                  საკადასტრო: {property.cadastral_code}
                </span>
              )}
            </div>
            {property.location_lat && property.location_lng ? (
              <div className="overflow-hidden rounded-[20px] border border-[#E2E8F0]">
                <BakurianiMap
                  className="h-[320px] w-full"
                  embedded
                  properties={[
                    {
                      id: property.id,
                      title: property.title,
                      price: Number(property.sale_price ?? 0),
                      lat: Number(property.location_lat),
                      lng: Number(property.location_lng),
                      isVip: property.is_vip ?? false,
                      isSuperVip: property.is_super_vip ?? false,
                      photo: Array.isArray(property.photos)
                        ? (property.photos[0] as string)
                        : undefined,
                    },
                  ]}
                  isForSale
                />
              </div>
            ) : (
              <div className="flex h-[200px] items-center justify-center rounded-[20px] border border-dashed border-[#E2E8F0] bg-[#F8FAFC] text-[13px] text-[#94A3B8]">
                რუკის კოორდინატები არ არის დამატებული
              </div>
            )}
          </motion.div>

          {reviews.length > 0 && (
            <motion.div {...fadeIn} transition={{ duration: 0.4, delay: 0.4 }}>
              <h2 className="mb-4 text-[20px] font-black leading-[30px] text-[#0F172A]">
                შეფასებები ({reviews.length})
              </h2>
              <div className="space-y-4">
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
            </motion.div>
          )}
        </div>

        <motion.div
          id="seller-sidebar"
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.4, delay: 0.2 }}
          className="lg:sticky lg:top-[calc(91px+94px+12px)] lg:self-start lg:max-h-[calc(100vh-(91px+94px)-24px)] lg:overflow-y-auto lg:pr-1"
        >
          <div className="space-y-4">
            <div className="rounded-[20px] border border-[#E2E8F0] bg-white p-8 shadow-[0px_16px_40px_-12px_rgba(0,0,0,0.15)]">
              <div className="mb-1 text-sm text-[#94A3B8]">ფასი</div>
              <div className="text-[32px] font-black leading-[32px] text-[#1E293B]">
                {salePrice > 0 ? formatPrice(salePrice) : "შეთანხმებით"}
              </div>
              {property.area_sqm != null && salePrice > 0 && (
                <div className="mt-1 text-sm text-[#94A3B8]">
                  {formatPrice(Math.round(salePrice / property.area_sqm))} / მ²
                </div>
              )}

              {(property.discount_percent ?? 0) > 0 && (
                <div className="mt-3 rounded-lg bg-red-50 p-2 text-center text-sm font-semibold text-red-600">
                  -{property.discount_percent}% ფასდაკლება
                </div>
              )}

              <div className="my-4 border-t border-[#E2E8F0]" />

              <div className="mb-4 flex items-center gap-3">
                <div className="relative size-10 shrink-0 overflow-hidden rounded-full bg-[#F8FAFC]">
                  {owner?.avatar_url ? (
                    <Image
                      src={owner.avatar_url}
                      alt={owner.display_name}
                      fill
                      className="object-cover"
                    />
                  ) : (
                    <div className="flex size-full items-center justify-center text-sm font-medium text-[#94A3B8]">
                      {owner?.display_name?.charAt(0) ?? "მ"}
                    </div>
                  )}
                </div>
                <div>
                  <p className="text-sm font-medium text-[#1E293B]">
                    {owner?.display_name ?? "მესაკუთრე"}
                  </p>
                  {owner?.is_verified && (
                    <div className="flex items-center gap-1 text-xs text-[#16A34A]">
                      <BadgeCheck className="size-3.5" />
                      ვერიფიცირებული მესაკუთრე
                    </div>
                  )}
                </div>
              </div>

              <Button
                onClick={() => router.push("/auth/login")}
                className="h-[55px] w-full gap-2 rounded-2xl bg-[#16A34A] text-[15px] font-bold tracking-[0.375px] text-white hover:bg-[#15803D]"
              >
                <Phone className="h-4 w-4" />
                კონტაქტი
              </Button>

              <button
                type="button"
                onClick={() => router.push("/auth/login")}
                className="mt-3 flex h-[48px] w-full items-center justify-center gap-2 rounded-2xl border border-[#E2E8F0] bg-white text-[14px] font-bold text-[#1E293B] transition-colors hover:bg-[#F8FAFC]"
              >
                <MessageSquare className="h-4 w-4" />
                შეტყობინების გაგზავნა
              </button>
            </div>

            {roiPercent > 0 && (
              <div className="rounded-2xl bg-emerald-50 p-5">
                <h3 className="mb-3 text-sm font-semibold text-emerald-800">
                  საინვესტიციო მონაცემები
                </h3>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-[#94A3B8]">ROI</span>
                    <span className="font-semibold text-emerald-700">
                      {roiPercent}%
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-[#94A3B8]">წლიური შემოსავალი</span>
                    <span className="font-semibold">
                      {formatPrice(Math.round(annualReturn))}
                    </span>
                  </div>
                  {property.construction_status && (
                    <div className="flex justify-between text-sm">
                      <span className="text-[#94A3B8]">სტატუსი</span>
                      <span className="font-semibold">
                        {property.construction_status}
                      </span>
                    </div>
                  )}
                  {property.developer && (
                    <div className="flex justify-between text-sm">
                      <span className="text-[#94A3B8]">დეველოპერი</span>
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

      <AnimatePresence>
        {isConstructionModalOpen && (
          <div className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/50"
              onClick={() => setConstructionModalOpen(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ duration: 0.2 }}
              className="relative z-10 w-full max-w-[520px] overflow-hidden rounded-[24px] bg-white shadow-[0px_25px_50px_-12px_rgba(0,0,0,0.35)]"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-4 border-b border-[#F1F5F9] px-6 py-5">
                <div>
                  <h2 className="text-[17px] font-black text-[#0F172A]">
                    მშენებლობის პროცესი
                  </h2>
                  <p className="mt-0.5 text-[12px] text-[#64748B]">
                    {property.developer ?? property.title}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="flex min-w-[56px] items-center justify-center rounded-full bg-[#16A34A] px-3 py-1.5 text-[14px] font-black text-white">
                    {constructionPct}%
                  </span>
                  <button
                    onClick={() => setConstructionModalOpen(false)}
                    className="flex size-8 items-center justify-center rounded-full text-[#94A3B8] transition-colors hover:bg-[#F1F5F9]"
                    aria-label="დახურვა"
                  >
                    <X className="size-4" />
                  </button>
                </div>
              </div>

              <div className="max-h-[70vh] overflow-y-auto px-6 py-5">
                <p className="mb-4 text-[12px] font-bold uppercase tracking-[0.5px] text-[#64748B]">
                  მიმდინარე ფაზები
                </p>

                <div className="mb-5 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {CONSTRUCTION_MILESTONES.map((m) => {
                    const done = constructionPct >= m.pctThreshold;
                    return (
                      <div
                        key={m.label}
                        className={
                          done
                            ? "flex items-center gap-2.5 rounded-[12px] border border-[#DCFCE7] bg-[#F0FDF4] px-3 py-2.5"
                            : "flex items-center gap-2.5 rounded-[12px] border border-[#F1F5F9] bg-white px-3 py-2.5"
                        }
                      >
                        <span
                          className={
                            done
                              ? "flex size-5 shrink-0 items-center justify-center rounded-full bg-[#16A34A] text-white"
                              : "flex size-5 shrink-0 items-center justify-center rounded-full border border-[#E2E8F0] bg-white text-[#CBD5E1]"
                          }
                        >
                          <Check className="size-3" strokeWidth={3} />
                        </span>
                        <span
                          className={
                            done
                              ? "text-[13px] font-bold text-[#1E293B]"
                              : "text-[13px] font-medium text-[#94A3B8]"
                          }
                        >
                          {m.label}
                        </span>
                      </div>
                    );
                  })}
                </div>

                <div className="mb-2 h-1.5 w-full overflow-hidden rounded-full bg-[#F1F5F9]">
                  <div
                    className="h-full rounded-full bg-[#16A34A] transition-all duration-500"
                    style={{ width: `${constructionPct}%` }}
                  />
                </div>

                <div className="mt-5 overflow-hidden rounded-[16px]">
                  <div className="relative aspect-[16/9]">
                    <Image
                      src={heroPhoto}
                      alt={property.title}
                      fill
                      sizes="(max-width: 640px) 90vw, 520px"
                      className="object-cover"
                    />
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <MobileStickyCTA
        primary={salePrice > 0 ? formatPrice(salePrice) : "შეთანხმებით"}
        secondary={property.location ?? undefined}
        ctaLabel="კონტაქტი"
        onClick={() =>
          document
            .getElementById("seller-sidebar")
            ?.scrollIntoView({ behavior: "smooth", block: "start" })
        }
        ctaClassName="shrink-0 rounded-xl bg-[#16A34A] px-6 py-3 text-[14px] font-bold text-white transition-colors hover:bg-[#15803D]"
      />
    </div>
  );
}
