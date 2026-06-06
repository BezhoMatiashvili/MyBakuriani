"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import dynamic from "next/dynamic";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  BadgeCheck,
  BedDouble,
  Building2,
  Check,
  Eye,
  Heart,
  MapPin,
  Maximize,
  MessageSquare,
  Share2,
  Star,
  X,
} from "lucide-react";
import { CallButton } from "@/components/shared/CallButton";
import { PhotoGallery } from "@/components/detail/PhotoGallery";
import ReviewCard from "@/components/cards/ReviewCard";
import { formatPrice, formatRelativeGe } from "@/lib/utils/format";
import ConstructionProgressBar from "@/components/shared/ConstructionProgressBar";
import { createClient } from "@/lib/supabase/client";
import { shareListing } from "@/lib/share";
import type { Tables, Database } from "@/lib/types/database";
import { SkierLoader } from "@/components/shared/SkierLoader";
import { MobileStickyCTA } from "@/components/shared/MobileStickyCTA";
import ZoneLocationLink from "@/components/maps/ZoneLocationLink";

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

type PropertyType = Database["public"]["Enums"]["property_type"];

const PROPERTY_TYPE_LABELS_GE: Record<PropertyType, string> = {
  apartment: "აპარტამენტი",
  cottage: "კოტეჯი",
  hotel: "სასტუმრო",
  studio: "სტუდია",
  villa: "ვილა",
};

function constructionStatusLabel(status: string | null): {
  label: string;
  tone: "active" | "done" | "neutral";
} | null {
  if (!status) return null;
  if (/under[_\s-]?construction|building|in[_\s-]?progress/i.test(status)) {
    return { label: "მშენებარე", tone: "active" };
  }
  if (/complete|finished|done|ready/i.test(status)) {
    return { label: "დასრულებული", tone: "done" };
  }
  return { label: status, tone: "neutral" };
}

function renovationStatusLabel(status: string | null): string | null {
  if (!status) return null;
  const map: Record<string, string> = {
    black_frame: "შავი კარკასი",
    white_frame: "თეთრი კარკასი",
    furnished: "ავეჯით",
  };
  return map[status] ?? status;
}

function deriveEnvironmentStatus(amenities: unknown): string | null {
  if (!Array.isArray(amenities)) return null;
  const tokens = amenities
    .filter((v): v is string => typeof v === "string")
    .map((v) => v.toLowerCase());
  if (
    tokens.some((t) =>
      ["complex_management", "concierge", "management"].includes(t),
    )
  ) {
    return "აქვს კომპლექსის მენეჯმენტი";
  }
  if (
    tokens.some((t) => ["security", "guarded", "24_7_security"].includes(t))
  ) {
    return "დაცული ტერიტორია";
  }
  return null;
}

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

  const postedAgo = (() => {
    if (!property.created_at) return null;
    const diffMs = Date.now() - new Date(property.created_at).getTime();
    const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    if (days <= 0) return "გამოქვეყნებულია: დღეს";
    if (days === 1) return "გამოქვეყნებულია: 1 დღის წინ";
    return `გამოქვეყნებულია: ${days} დღის წინ`;
  })();

  const isUnderConstruction =
    property.construction_status === "under_construction" ||
    /under[_\s-]?construction/i.test(property.construction_status ?? "");
  const constructionPct = isUnderConstruction
    ? (property.construction_progress_percent ?? 0)
    : 100;
  const showConstructionSection =
    isUnderConstruction && property.construction_progress_percent !== null;

  const heroPhoto =
    Array.isArray(property.photos) && property.photos.length > 0
      ? (property.photos[0] as string)
      : "/placeholder-property.jpg";
  const constructionImg = property.construction_image_url ?? heroPhoto;

  const propertyTypeLabel = PROPERTY_TYPE_LABELS_GE[property.type] ?? "ქონება";

  const locationParts = (property.location ?? "")
    .split(/[,/]/)
    .map((s) => s.trim())
    .filter(Boolean);
  const locationDisplay = locationParts.length
    ? locationParts.slice(0, 2).join(" / ")
    : (property.location ?? "");

  const statusInfo = constructionStatusLabel(property.construction_status);
  const envStatus = deriveEnvironmentStatus(property.amenities);

  const roiText =
    property.roi_percent_max != null
      ? `${roiPercent}-${property.roi_percent_max}%`
      : `${roiPercent}%`;
  const renovationLabel = renovationStatusLabel(property.renovation_status);
  const metricCells: { label: string; value: ReactNode; sub?: string }[] = [];
  if (statusInfo) {
    metricCells.push({
      label: "მშენებლობის სტადია",
      value: statusInfo.label,
      sub: property.completion_year
        ? `ბარდდება: ${property.completion_year} წელს`
        : undefined,
    });
  }
  if (renovationLabel) {
    metricCells.push({
      label: "რემონტის მდგომარეობა",
      value: renovationLabel,
    });
  }
  if (roiPercent > 0) {
    metricCells.push({
      label: "მოსალოდნელი ROI",
      value: (
        <span className="flex items-center gap-2">
          {roiText}
          <span className="rounded-full bg-[#F0FDF4] px-2 py-0.5 text-[11px] font-bold text-[#16A34A]">
            {roiPercent >= 12 ? "მაღალი" : "საშუალო"}
          </span>
        </span>
      ),
    });
  }
  if (envStatus) {
    metricCells.push({ label: "გაყიდვის სტატუსი", value: envStatus });
  }
  if (property.cadastral_code) {
    metricCells.push({
      label: "საკადასტრო კოდი",
      value: property.cadastral_code,
    });
  }
  metricCells.push({ label: "მისამართი", value: property.location ?? "—" });

  const shortId = property.id.replace(/-/g, "").slice(0, 8).toUpperCase();

  const handleShare = () => shareListing(property.title);

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 pb-[88px] sm:py-8 md:pb-8">
      {/* Top action row: back + share/heart */}
      <motion.div
        {...fadeIn}
        className="mb-6 flex items-center justify-between"
      >
        <button
          onClick={() => router.back()}
          className="flex items-center gap-1.5 text-sm text-[#64748B] transition-colors hover:text-[#1E293B]"
        >
          <ArrowLeft className="h-4 w-4" />
          უკან დაბრუნება
        </button>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={handleShare}
            className="flex h-9 items-center gap-1.5 rounded-lg px-3 text-[13px] font-medium text-[#64748B] transition-colors hover:bg-[#F8FAFC] hover:text-[#1E293B]"
            aria-label="გაზიარება"
          >
            <Share2 className="h-[15px] w-[15px]" />
            <span className="underline-offset-2 hover:underline">
              გაზიარება
            </span>
          </button>
          <button
            type="button"
            className="flex h-9 items-center gap-1.5 rounded-lg px-3 text-[13px] font-medium text-[#64748B] transition-colors hover:bg-[#F8FAFC] hover:text-red-500"
            aria-label="ფავორიტებში დამატება"
          >
            <Heart className="h-[15px] w-[15px]" />
            <span className="underline-offset-2 hover:underline">შენახვა</span>
          </button>
        </div>
      </motion.div>

      {/* Title block (above gallery) */}
      <motion.div
        {...fadeIn}
        transition={{ duration: 0.4, delay: 0.08 }}
        className="mb-6"
      >
        <h1 className="text-[28px] font-black leading-[34px] text-[#1E293B] sm:text-[34px] sm:leading-[42px]">
          {property.title}
        </h1>
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[13px] text-[#64748B] sm:text-[14px]">
          <ZoneLocationLink
            location={property.location ?? locationDisplay}
            lat={property.location_lat}
            lng={property.location_lng}
            className="font-medium text-[#475569]"
            iconClassName="text-[#16A34A]"
          />
          {postedAgo && (
            <span className="flex items-center gap-2 font-medium">
              <span className="hidden h-1 w-1 rounded-full bg-[#CBD5E1] sm:inline-block" />
              {postedAgo}
            </span>
          )}
          {avgRating !== null && (
            <span className="flex items-center gap-1.5 font-bold text-[#1E293B]">
              <Star className="h-4 w-4 fill-[#EAB308] text-[#EAB308]" />
              {avgRating.toFixed(1)}
            </span>
          )}
          {property.views_count != null && (
            <span className="flex items-center gap-1.5 font-medium">
              <Eye className="h-4 w-4" />
              {property.views_count}
            </span>
          )}
        </div>
      </motion.div>

      {/* Photo gallery */}
      <motion.div
        {...fadeIn}
        transition={{ duration: 0.4, delay: 0.12 }}
        className="[&>div:first-child]:hidden"
      >
        <PhotoGallery photos={property.photos ?? []} title={property.title} />
      </motion.div>

      {/* 3-stat row + ID */}
      <motion.div
        {...fadeIn}
        transition={{ duration: 0.4, delay: 0.16 }}
        className="mt-6 flex flex-wrap items-center gap-3"
      >
        {property.area_sqm != null && (
          <div className="flex flex-1 min-w-[140px] items-center gap-3 rounded-[16px] border border-[#E2E8F0] bg-white px-4 py-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-[#F0FDF4] text-[#16A34A]">
              <Maximize className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-[15px] font-black text-[#1E293B]">
                {property.area_sqm} მ²
              </p>
              <p className="text-[11px] font-medium text-[#94A3B8]">ფართობი</p>
            </div>
          </div>
        )}
        <div className="flex flex-1 min-w-[140px] items-center gap-3 rounded-[16px] border border-[#E2E8F0] bg-white px-4 py-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-[#F1F5F9] text-[#475569]">
            <Building2 className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-[15px] font-black text-[#1E293B]">
              {propertyTypeLabel}
            </p>
            <p className="text-[11px] font-medium text-[#94A3B8]">
              ობიექტის ტიპი
            </p>
          </div>
        </div>
        {property.rooms != null && (
          <div className="flex flex-1 min-w-[140px] items-center gap-3 rounded-[16px] border border-[#E2E8F0] bg-white px-4 py-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-[#F1F5F9] text-[#475569]">
              <BedDouble className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-[15px] font-black text-[#1E293B]">
                {property.rooms} ოთახი
              </p>
              <p className="text-[11px] font-medium text-[#94A3B8]">
                გეგმარება
              </p>
            </div>
          </div>
        )}
        <span className="ms-auto rounded-full border border-[#E2E8F0] bg-[#F8FAFC] px-3 py-1.5 text-[11px] font-bold tracking-[0.5px] text-[#64748B]">
          ID: {shortId}
        </span>
      </motion.div>

      <div className="mt-8 grid grid-cols-1 gap-12 lg:grid-cols-3">
        <div className="space-y-10 lg:col-span-2">
          {/* Investment metrics box */}
          <motion.div {...fadeIn} transition={{ duration: 0.4, delay: 0.18 }}>
            <h2 className="mb-3 text-[20px] font-black leading-[30px] text-[#0F172A]">
              საინვესტიციო მეტრიკები და სტატუსი
            </h2>
            <div className="rounded-[20px] border border-[#E2E8F0] bg-[#F7F8FC] px-5 py-1 sm:px-7">
              <div className="grid grid-cols-1 sm:grid-cols-2">
                {metricCells.map((cell, i) => (
                  <div
                    key={cell.label}
                    className={`border-t border-[#E9EBF3] py-4 first:border-t-0 ${
                      i === 1 ? "sm:border-t-0" : ""
                    } ${i % 2 === 0 ? "sm:pr-8" : "sm:pl-8"}`}
                  >
                    <p className="text-[11px] font-bold uppercase tracking-[0.5px] text-[#94A3B8]">
                      {cell.label}
                    </p>
                    <div className="mt-1.5 text-[15px] font-black text-[#1E293B]">
                      {cell.value}
                    </div>
                    {cell.sub && (
                      <p className="mt-0.5 text-[12px] font-medium text-[#94A3B8]">
                        {cell.sub}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </motion.div>

          {/* Description */}
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

          {/* Construction process card */}
          {showConstructionSection && (
            <motion.div {...fadeIn} transition={{ duration: 0.4, delay: 0.25 }}>
              <h2 className="mb-3 text-[20px] font-black leading-[30px] text-[#0F172A]">
                მშენებლობის პროცესი
              </h2>
              <div className="overflow-hidden rounded-[20px] border border-[#E2E8F0] bg-white">
                <div className="relative aspect-[16/7] overflow-hidden">
                  <Image
                    src={constructionImg}
                    alt={property.title}
                    fill
                    sizes="(max-width: 1024px) 100vw, 700px"
                    className="object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
                  <span className="absolute left-4 top-4 rounded-full bg-white/90 px-3 py-1 text-[11px] font-bold text-[#16A34A] backdrop-blur">
                    მშენებარე
                    {property.completion_year
                      ? ` (${property.completion_year})`
                      : ""}
                  </span>
                  <div className="absolute inset-x-0 bottom-0 p-5">
                    <p className="text-[18px] font-black uppercase tracking-[0.3px] text-white sm:text-[22px]">
                      {property.developer ?? property.title}
                    </p>
                  </div>
                </div>

                <div className="space-y-4 p-5">
                  <ConstructionProgressBar
                    percent={constructionPct}
                    label="მშენებლობის პროგრესი"
                  />
                  {property.progress_note && (
                    <div className="rounded-[12px] border border-[#EEF1F4] bg-[#F8FAFC] p-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] font-bold uppercase tracking-[0.5px] text-[#64748B]">
                          დეველოპერის განახლება
                        </span>
                        {property.progress_note_updated_at && (
                          <span className="text-[10px] font-semibold text-[#94A3B8]">
                            {formatRelativeGe(
                              property.progress_note_updated_at,
                            )}
                          </span>
                        )}
                      </div>
                      <p className="mt-1.5 text-[12px] italic leading-[18px] text-[#475569]">
                        &ldquo;{property.progress_note}&rdquo;
                      </p>
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => setConstructionModalOpen(true)}
                    className="group flex w-full items-center justify-center gap-2 rounded-[12px] border border-[#E2E8F0] bg-[#F8FAFC] px-4 py-3 text-[13px] font-bold text-[#1E293B] transition-colors hover:border-[#16A34A] hover:bg-[#F0FDF4]"
                  >
                    <Eye className="h-4 w-4 text-[#64748B] transition-colors group-hover:text-[#16A34A]" />
                    დეტალების ნახვა
                  </button>
                </div>
              </div>
            </motion.div>
          )}

          {/* Map */}
          <motion.div {...fadeIn} transition={{ duration: 0.4, delay: 0.32 }}>
            <h2 className="mb-3 text-[20px] font-black leading-[30px] text-[#0F172A]">
              ზუსტი ლოკაცია
            </h2>
            <div className="mb-3 flex items-center gap-2 text-[14px] font-medium text-[#64748B]">
              <MapPin className="h-4 w-4 text-[#16A34A]" />
              {property.location}
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

          {/* Reviews */}
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

        {/* Sidebar */}
        <motion.div
          id="seller-sidebar"
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.4, delay: 0.2 }}
          className="lg:sticky lg:top-[calc(91px+12px)] lg:self-start"
        >
          <div className="space-y-4">
            {/* Price + owner card */}
            <div className="relative rounded-[20px] border border-[#E2E8F0] bg-white p-7 shadow-[0px_16px_40px_-12px_rgba(0,0,0,0.15)]">
              {property.is_super_vip && (
                <span className="absolute right-5 top-5 rounded bg-brand-vip-super px-2 py-1 text-[10px] font-black uppercase tracking-[0.25px] text-white">
                  Super VIP
                </span>
              )}
              {property.is_vip && !property.is_super_vip && (
                <span className="absolute right-5 top-5 rounded bg-brand-vip px-2 py-1 text-[10px] font-black uppercase tracking-[0.25px] text-white">
                  VIP
                </span>
              )}

              <div className="mb-1 text-sm text-[#94A3B8]">ფასი</div>
              <div className="text-[32px] font-black leading-[34px] text-[#1E293B]">
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

              <div className="my-5 border-t border-[#E2E8F0]" />

              {/* Owner */}
              <div className="mb-5 flex items-center gap-3">
                <div className="relative size-11 shrink-0 overflow-hidden rounded-full bg-[#F8FAFC]">
                  {owner?.avatar_url ? (
                    <Image
                      src={owner.avatar_url}
                      alt={owner.display_name}
                      fill
                      className="object-cover"
                    />
                  ) : (
                    <div className="flex size-full items-center justify-center text-sm font-bold text-[#94A3B8]">
                      {owner?.display_name?.charAt(0) ?? "მ"}
                    </div>
                  )}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-[15px] font-bold text-[#1E293B]">
                    {owner?.display_name ?? "მესაკუთრე"}
                  </p>
                  {owner?.is_verified ? (
                    <div className="flex items-center gap-1 text-xs text-[#16A34A]">
                      <BadgeCheck className="size-3.5" />
                      ვერიფიცირებული მესაკუთრე
                    </div>
                  ) : (
                    <p className="text-xs text-[#94A3B8]">
                      მესაკუთრე / ინვესტორი
                    </p>
                  )}
                </div>
              </div>

              <CallButton
                phone={property.phone ?? property.profiles?.phone ?? null}
                onNoPhoneClick={() => router.push("/auth/login")}
                className="h-[55px] w-full gap-2 rounded-2xl bg-[#16A34A] text-[15px] font-bold tracking-[0.375px] text-white hover:bg-[#15803D]"
                label="დარეკვა"
                propertyId={property.id}
              />

              <button
                type="button"
                onClick={() => router.push("/auth/login")}
                className="mt-3 flex h-[48px] w-full items-center justify-center gap-2 rounded-2xl border border-[#E2E8F0] bg-white text-[14px] font-bold text-[#1E293B] transition-colors hover:bg-[#F8FAFC]"
              >
                <MessageSquare className="h-4 w-4" />
                შეტყობინების მიწერა
              </button>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Construction milestones modal */}
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
        ctaLabel="დარეკვა"
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
