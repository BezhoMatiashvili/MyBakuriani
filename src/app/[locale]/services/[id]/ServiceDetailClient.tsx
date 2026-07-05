"use client";

import { useEffect } from "react";
import { useRouter } from "@/i18n/navigation";
import Image from "next/image";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  Clock,
  BadgeCheck,
  ChevronRight,
  Languages,
  MapPin,
  Share2,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { CallButton } from "@/components/shared/CallButton";
import { WhatsAppButton } from "@/components/shared/WhatsAppButton";
import { shareListing } from "@/lib/share";
import { formatPrice } from "@/lib/utils/format";
import { MobileStickyCTA } from "@/components/shared/MobileStickyCTA";
import ZoneLocationLink from "@/components/maps/ZoneLocationLink";
import { createClient } from "@/lib/supabase/client";
import {
  optionKeyFor,
  priceUnitPathFor,
  type OptionGroup,
} from "@/lib/constants/listing-options";
import type { Tables } from "@/lib/types/database";
import PendingReviewBanner from "@/components/listing/PendingReviewBanner";

type ServiceWithOwner = Tables<"services"> & {
  profiles: Tables<"profiles"> | null;
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

export default function ServiceDetailClient({
  service,
  isMock = false,
  isPending = false,
}: Props) {
  const router = useRouter();
  const t = useTranslations("ServiceDetail");
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
  // /create/service stores either an experienceOptions label or "N წელი".
  const experienceLabel = (() => {
    const value = service.experience_required;
    if (!value) return null;
    const key = optionKeyFor("experienceOptions", value);
    if (key) return tOpts(`experienceOptions.${key}`);
    const years = value.match(/^(\d+)\s*წელი$/u);
    return years ? t("experienceYears", { count: Number(years[1]) }) : value;
  })();
  const owner = service.profiles;
  const categoryLabel = tCard.has(`categories.${service.category}`)
    ? tCard(`categories.${service.category}`)
    : service.category;

  useEffect(() => {
    if (isMock) return;
    const supabase = createClient();
    supabase
      .from("services")
      .update({ views_count: (service.views_count ?? 0) + 1 })
      .eq("id", service.id)
      .then();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [service.id, isMock]);

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 pb-[calc(88px+env(safe-area-inset-bottom))] sm:py-8 lg:pb-8">
      {isPending && <PendingReviewBanner />}
      {/* Breadcrumb */}
      <motion.nav
        {...fadeIn}
        className="mb-4 flex items-center gap-1.5 text-[12px] text-[#94A3B8]"
      >
        <span>{t("breadcrumbRoot")}</span>
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="text-[#64748B]">{categoryLabel}</span>
      </motion.nav>

      <motion.div
        {...fadeIn}
        className="mb-6 flex items-center justify-between"
      >
        <button
          type="button"
          onClick={() => router.back()}
          className="flex items-center gap-1.5 text-sm text-[#64748B] transition-colors hover:text-[#1E293B]"
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
          className="flex items-center gap-1.5 rounded-full border border-[#E2E8F0] bg-white px-3.5 py-2 text-[13px] font-bold text-[#64748B] transition-colors hover:bg-[#F8FAFC]"
        >
          <Share2 className="h-4 w-4" />
          {tShare("label")}
        </button>
      </motion.div>

      {/* Title */}
      <motion.div {...fadeIn} transition={{ duration: 0.4, delay: 0.15 }}>
        <h1 className="text-[28px] font-black leading-[34px] text-[#1E293B] sm:text-[36px] sm:leading-[44px]">
          {service.title}
        </h1>
        <div className="mt-3 flex flex-wrap items-center gap-4 text-[14px] text-[#64748B]">
          <span className="flex items-center gap-2 font-medium">
            <span className="relative size-7 shrink-0 overflow-hidden rounded-full bg-[#F8FAFC]">
              {owner?.avatar_url ? (
                <Image
                  src={owner.avatar_url}
                  alt={owner.display_name ?? ""}
                  fill
                  sizes="28px"
                  className="object-cover"
                />
              ) : (
                <span className="flex size-full items-center justify-center text-[12px] font-bold text-[#94A3B8]">
                  {owner?.display_name?.charAt(0) ?? t("providerInitial")}
                </span>
              )}
            </span>
            {service.provider_name ??
              owner?.display_name ??
              t("providerFallback")}
            {owner?.is_verified && (
              <BadgeCheck className="h-4 w-4 text-[#2563EB]" />
            )}
          </span>
          {service.service_field && (
            <span className="rounded-full bg-[#EFF6FF] px-3 py-1 text-[13px] font-semibold text-[#2563EB]">
              {optionLabel("serviceSpheres", service.service_field)}
            </span>
          )}
        </div>
      </motion.div>

      {/* Description */}
      {service.description && (
        <motion.div
          {...fadeIn}
          transition={{ duration: 0.4, delay: 0.2 }}
          className="mt-8"
        >
          <h2 className="mb-3 text-[20px] font-black leading-[30px] text-[#0F172A]">
            {t("about")}
          </h2>
          <p className="whitespace-pre-line text-[15px] font-medium leading-[27px] text-[#475569]">
            {service.description}
          </p>
        </motion.div>
      )}

      {/* Stats grid */}
      <motion.div
        {...fadeIn}
        transition={{ duration: 0.4, delay: 0.25 }}
        className="mt-8 grid grid-cols-2 gap-4 rounded-[20px] border border-[#E2E8F0] bg-[#F8FAFC] p-6 sm:grid-cols-4"
      >
        <div className="flex flex-col gap-1">
          <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.5px] text-[#94A3B8]">
            <MapPin className="h-3.5 w-3.5" />
            {t("coverageArea")}
          </span>
          <ZoneLocationLink
            location={
              // /create/service stores a comma-joined list of coverageZones labels.
              service.location
                ?.split(", ")
                .map((zone) => optionLabel("coverageZones", zone))
                .join(", ") ?? t("bakuriani")
            }
            className="text-[15px] font-black text-[#1E293B]"
            prefix=""
            showIcon={false}
          />
        </div>
        {service.languages && service.languages.length > 0 && (
          <div className="flex flex-col gap-1">
            <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.5px] text-[#94A3B8]">
              <Languages className="h-3.5 w-3.5" />
              {t("languages")}
            </span>
            <span className="text-[15px] font-black text-[#1E293B]">
              {service.languages
                .map((lang) => optionLabel("languages", lang))
                .join(", ")}
            </span>
          </div>
        )}
        {service.schedule && (
          <div className="flex flex-col gap-1">
            <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.5px] text-[#94A3B8]">
              <Clock className="h-3.5 w-3.5" />
              {t("schedule")}
            </span>
            <span className="text-[15px] font-black text-[#1E293B]">
              {service.schedule}
            </span>
          </div>
        )}
        {service.experience_required && (
          <div className="flex flex-col gap-1">
            <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.5px] text-[#94A3B8]">
              <BadgeCheck className="h-3.5 w-3.5" />
              {t("experience")}
            </span>
            <span className="text-[15px] font-black text-[#1E293B]">
              {experienceLabel}
            </span>
          </div>
        )}
      </motion.div>

      {/* Verified specialist callout */}
      {owner?.is_verified && (
        <motion.div
          {...fadeIn}
          transition={{ duration: 0.4, delay: 0.3 }}
          className="mt-6 flex items-start gap-4 rounded-[20px] border border-[#DBEAFE] bg-[#F0F7FF] p-6"
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#2563EB] text-white">
            <BadgeCheck className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-[15px] font-black text-[#1E293B]">
              {t("verifiedTitle")}
            </h3>
            <p className="mt-1 text-[13px] leading-[20px] text-[#64748B]">
              {t("verifiedBody")}
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
        {service.price != null && (
          <div className="flex items-baseline">
            <span className="text-[28px] font-black leading-[32px] text-[#1E293B]">
              {formatPrice(service.price)}
            </span>
            {service.price_unit && (
              <span className="ml-1 text-sm text-[#94A3B8]">
                / {priceUnitPath ? tOpts(priceUnitPath) : service.price_unit}
              </span>
            )}
          </div>
        )}
        <div className="flex items-center gap-3">
          <WhatsAppButton phone={service.phone} serviceId={service.id} />
          <CallButton
            phone={service.phone}
            className="h-12 flex-1 gap-2 rounded-full bg-[#22C55E] px-8 text-[15px] font-bold text-white hover:bg-[#16A34A] sm:flex-none"
            label={tCard("call")}
            alwaysShowLabel
            onNoPhoneClick={() => router.push("/auth/login")}
            serviceId={service.id}
          />
        </div>
      </motion.div>

      {service.price != null && (
        <MobileStickyCTA
          primary={`${formatPrice(service.price)}${service.price_unit ? ` / ${priceUnitPath ? tOpts(priceUnitPath) : service.price_unit}` : ""}`}
          secondary={service.location ?? undefined}
          ctaLabel={tCard("call")}
          onClick={() =>
            document
              .getElementById("contact-sidebar")
              ?.scrollIntoView({ behavior: "smooth", block: "start" })
          }
          ctaClassName="shrink-0 rounded-xl bg-[#22C55E] px-6 py-3 text-[14px] font-bold text-white transition-colors hover:bg-[#16A34A]"
        />
      )}
    </div>
  );
}
