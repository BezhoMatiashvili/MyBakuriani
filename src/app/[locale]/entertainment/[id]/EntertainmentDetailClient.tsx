"use client";

import { useEffect } from "react";
import { useRouter } from "@/i18n/navigation";
import Image from "next/image";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  Clock,
  Users,
  CheckCircle2,
  ImageIcon,
  Star,
  ShieldCheck,
  Share2,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { CallButton } from "@/components/shared/CallButton";
import { WhatsAppButton } from "@/components/shared/WhatsAppButton";
import { shareListing } from "@/lib/share";
import { formatPrice } from "@/lib/utils/format";
import { applyDiscount, isDiscountActive } from "@/lib/utils/pricing";
import { MobileStickyCTA } from "@/components/shared/MobileStickyCTA";
import ZoneLocationLink from "@/components/maps/ZoneLocationLink";
import {
  optionKeyFor,
  priceUnitPathFor,
  type OptionGroup,
} from "@/lib/constants/listing-options";
import type { Tables } from "@/lib/types/database";
import PendingReviewBanner from "@/components/listing/PendingReviewBanner";

type ServiceWithOwner = Tables<"services"> & {
  profiles: Tables<"profiles"> | null;
  has_whatsapp?: boolean;
};

interface Props {
  service: ServiceWithOwner;
  isMock?: boolean;
  isPending?: boolean;
}

const fadeIn = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.4 },
};

export default function EntertainmentDetailClient({
  service,
  isMock = false,
  isPending = false,
}: Props) {
  const router = useRouter();
  const t = useTranslations("EntertainmentDetail");
  const tShared = useTranslations("Shared");
  const tShare = useTranslations("ShareListing");
  const tCard = useTranslations("ServiceCard");
  const tOpts = useTranslations("ListingOptions");
  // Translates a stored DB option value; falls through to the raw value for
  // custom/free-text entries.
  const optionLabel = (group: OptionGroup, value: string | null) => {
    const key = optionKeyFor(group, value);
    return key ? tOpts(`${group}.${key}`) : value;
  };
  const priceUnitPath = priceUnitPathFor(service.price_unit);
  const discountActive = isDiscountActive(
    service.discount_percent,
    service.discount_expires_at,
  );
  const displayPrice =
    service.price != null
      ? Math.round(
          applyDiscount(
            service.price,
            service.discount_percent,
            service.discount_expires_at,
          ),
        )
      : null;
  const photos = service.photos ?? [];
  const mainPhoto = photos[0];

  useEffect(() => {
    if (isMock) return;
    void fetch(`/api/listings/service/${service.id}/view`, { method: "POST" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [service.id, isMock]);

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 pb-[calc(88px+env(safe-area-inset-bottom))] sm:py-8 lg:pb-8">
      {isPending && <PendingReviewBanner />}
      {/* Hero photo with floating back button */}
      <motion.div
        {...fadeIn}
        className="relative aspect-[16/9] w-full overflow-hidden rounded-[24px] bg-[#F8FAFC]"
      >
        {mainPhoto && (
          <Image
            src={mainPhoto}
            alt={service.title}
            fill
            sizes="(max-width: 1024px) 100vw, 1024px"
            className="object-cover"
            priority
          />
        )}
        <button
          type="button"
          onClick={() => router.back()}
          className="absolute left-4 top-4 flex items-center gap-1.5 rounded-full bg-white/90 px-4 py-2 text-[13px] font-bold text-[#1E293B] shadow-sm backdrop-blur transition-colors hover:bg-white"
        >
          <ArrowLeft className="h-4 w-4" />
          {tShared("back")}
        </button>
        <button
          type="button"
          onClick={() =>
            shareListing(service.title, {
              copied: tShare("copied"),
              error: tShare("error"),
            })
          }
          aria-label={tShare("label")}
          className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/90 text-[#1E293B] shadow-sm backdrop-blur transition-colors hover:bg-white"
        >
          <Share2 className="h-[18px] w-[18px]" />
        </button>
        {photos.length > 0 && (
          <button
            type="button"
            className="absolute bottom-4 left-4 flex items-center gap-2 rounded-full bg-white/90 px-4 py-2 text-[13px] font-bold text-[#1E293B] shadow-sm backdrop-blur transition-colors hover:bg-white"
          >
            <ImageIcon className="h-4 w-4" />
            {t("photoGallery", { count: photos.length })}
          </button>
        )}
      </motion.div>

      {/* Category + title */}
      <motion.div
        {...fadeIn}
        transition={{ duration: 0.4, delay: 0.15 }}
        className="mt-6"
      >
        <div className="mb-2 text-[12px] font-bold uppercase tracking-[1px] text-[#2563EB]">
          {[
            optionLabel("entertainmentTypes", service.activity_type),
            optionLabel("entertainmentCategories", service.activity_category),
          ]
            .filter(Boolean)
            .join(" / ") || tCard("categories.entertainment")}
        </div>
        <h1 className="text-[28px] font-black leading-[34px] text-[#1E293B] sm:text-[36px] sm:leading-[44px]">
          {service.title}
        </h1>
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-[14px] text-[#64748B]">
          {service.rating != null && (
            <span className="inline-flex items-center gap-1.5 font-bold text-[#1E293B]">
              <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
              {service.rating.toFixed(1)}
              <span className="font-medium text-[#94A3B8]">
                {t("reviewsCount", { count: service.reviews_count ?? 0 })}
              </span>
            </span>
          )}
          {service.location && (
            <ZoneLocationLink
              location={service.location}
              className="font-medium"
            />
          )}
        </div>
      </motion.div>

      {/* What to expect / description */}
      {service.description && (
        <motion.div
          {...fadeIn}
          transition={{ duration: 0.4, delay: 0.2 }}
          className="mt-8"
        >
          <h2 className="mb-3 text-[20px] font-black leading-[30px] text-[#0F172A]">
            {t("whatWeOffer")}
          </h2>
          <p className="whitespace-pre-line text-[15px] font-medium leading-[27px] text-[#475569]">
            {service.description}
          </p>
        </motion.div>
      )}

      {/* Stats grid — four separate cards */}
      <motion.div
        {...fadeIn}
        transition={{ duration: 0.4, delay: 0.25 }}
        className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4"
      >
        {service.duration && (
          <div className="flex flex-col gap-1.5 rounded-[16px] border border-[#E2E8F0] bg-white p-5">
            <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.5px] text-[#94A3B8]">
              <Clock className="h-3.5 w-3.5" />
              {t("duration")}
            </span>
            <span className="text-[16px] font-black text-[#1E293B]">
              {optionLabel("durations", service.duration)}
            </span>
          </div>
        )}
        {service.age_min && (
          <div className="flex flex-col gap-1.5 rounded-[16px] border border-[#E2E8F0] bg-white p-5">
            <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.5px] text-[#94A3B8]">
              <Users className="h-3.5 w-3.5" />
              {t("age")}
            </span>
            <span className="text-[16px] font-black text-[#1E293B]">
              {optionLabel("ageOptions", service.age_min)}
            </span>
          </div>
        )}
        {service.good_for && (
          <div className="flex flex-col gap-1.5 rounded-[16px] border border-[#E2E8F0] bg-white p-5">
            <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.5px] text-[#94A3B8]">
              <CheckCircle2 className="h-3.5 w-3.5" />
              {t("availability")}
            </span>
            <span className="text-[16px] font-black text-[#1E293B]">
              {optionLabel("audienceOptions", service.good_for)}
            </span>
          </div>
        )}
        {service.operating_hours && (
          <div className="flex flex-col gap-1.5 rounded-[16px] border border-[#E2E8F0] bg-white p-5">
            <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.5px] text-[#94A3B8]">
              <Clock className="h-3.5 w-3.5" />
              {t("hours")}
            </span>
            <span className="text-[16px] font-black text-[#1E293B]">
              {service.operating_hours}
            </span>
          </div>
        )}
      </motion.div>

      {/* Safety & conditions */}
      {service.safety_notes && (
        <motion.div
          {...fadeIn}
          transition={{ duration: 0.4, delay: 0.3 }}
          className="mt-6 flex items-start gap-3 rounded-[16px] border border-[#DBEAFE] bg-[#EFF6FF] p-5"
        >
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#DBEAFE] text-[#2563EB]">
            <ShieldCheck className="h-5 w-5" />
          </span>
          <div>
            <h3 className="text-[15px] font-black text-[#1E293B]">
              {t("safetyAndConditions")}
            </h3>
            <p className="mt-1 whitespace-pre-line text-[14px] font-medium leading-[22px] text-[#475569]">
              {service.safety_notes}
            </p>
          </div>
        </motion.div>
      )}

      {/* Price + CTA row */}
      <motion.div
        id="contact-sidebar"
        {...fadeIn}
        transition={{ duration: 0.4, delay: 0.35 }}
        className="mt-8 flex flex-col items-stretch justify-between gap-4 rounded-[20px] border border-[#E2E8F0] bg-white p-6 sm:flex-row sm:items-center"
      >
        <div>
          {service.price != null && (
            <div>
              {discountActive && (
                <span className="mr-2 text-sm font-bold text-[#94A3B8] line-through">
                  {formatPrice(service.price)}
                </span>
              )}
              <span className="text-[32px] font-black leading-[32px] text-[#1E293B]">
                {formatPrice(displayPrice!)}
              </span>
              <span className="ml-1 text-sm text-[#94A3B8]">
                /{" "}
                {priceUnitPath
                  ? tOpts(priceUnitPath)
                  : (service.price_unit ?? t("oneHour"))}
              </span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-3">
          <WhatsAppButton
            hasWhatsApp={service.has_whatsapp ?? false}
            whatsapp={null}
            serviceId={service.id}
          />
          <CallButton
            phone={null}
            className="flex-1 px-8 sm:flex-none"
            label={t("callOrBook")}
            serviceId={service.id}
          />
        </div>
      </motion.div>

      {service.price != null && (
        <MobileStickyCTA
          primary={`${formatPrice(displayPrice!)} / ${priceUnitPath ? tOpts(priceUnitPath) : (service.price_unit ?? t("oneHour"))}`}
          secondary={service.location ?? undefined}
          ctaLabel={tCard("call")}
          onClick={() =>
            document
              .getElementById("contact-sidebar")
              ?.scrollIntoView({ behavior: "smooth", block: "start" })
          }
          tone="contact"
        />
      )}
    </div>
  );
}
