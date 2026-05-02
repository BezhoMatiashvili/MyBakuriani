"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  Clock,
  Eye,
  BadgeCheck,
  Star,
  ChevronRight,
  Languages,
  Briefcase,
} from "lucide-react";
import { CallButton } from "@/components/shared/CallButton";
import { WhatsAppButton } from "@/components/shared/WhatsAppButton";
import { formatPrice } from "@/lib/utils/format";
import { createClient } from "@/lib/supabase/client";
import type { Tables } from "@/lib/types/database";

type ServiceWithOwner = Tables<"services"> & {
  profiles: Tables<"profiles"> | null;
};

interface Props {
  service: ServiceWithOwner;
  isMock?: boolean;
}

const CATEGORY_LABELS: Record<string, string> = {
  cleaning: "დალაგება",
  handyman: "ხელოსანი",
  entertainment: "გართობა",
  transport: "ტრანსპორტი",
  food: "კვება",
  employment: "დასაქმება",
};

const fadeIn = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.4 },
};

export default function ServiceDetailClient({
  service,
  isMock = false,
}: Props) {
  const router = useRouter();
  const owner = service.profiles;
  const categoryLabel = CATEGORY_LABELS[service.category] ?? service.category;

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
    <div className="mx-auto max-w-5xl px-4 py-6 sm:py-8">
      {/* Breadcrumb */}
      <motion.nav
        {...fadeIn}
        className="mb-4 flex items-center gap-1.5 text-[12px] text-[#94A3B8]"
      >
        <span>სერვისი</span>
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="text-[#64748B]">{categoryLabel}</span>
      </motion.nav>

      <motion.button
        {...fadeIn}
        onClick={() => router.back()}
        className="mb-6 flex items-center gap-1.5 text-sm text-[#64748B] transition-colors hover:text-[#1E293B]"
      >
        <ArrowLeft className="h-4 w-4" />
        უკან დაბრუნება
      </motion.button>

      {/* Title */}
      <motion.div {...fadeIn} transition={{ duration: 0.4, delay: 0.15 }}>
        <h1 className="text-[28px] font-black leading-[34px] text-[#1E293B] sm:text-[36px] sm:leading-[44px]">
          {service.title}
        </h1>
        <div className="mt-3 flex flex-wrap items-center gap-4 text-[14px] text-[#64748B]">
          <span className="flex items-center gap-1.5 font-medium">
            {owner?.display_name ?? "სერვისის მომწოდებელი"}
            {owner?.is_verified && (
              <BadgeCheck className="h-4 w-4 text-[#2563EB]" />
            )}
          </span>
          <span className="flex items-center gap-1.5 font-medium">
            <Star className="h-4 w-4 fill-[#FBBF24] text-[#FBBF24]" />
            4.9 (34 შეფასება)
          </span>
          <span className="flex items-center gap-1.5 font-medium">
            <Eye className="h-4 w-4" />
            {service.views_count ?? 0} ნახვა
          </span>
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
            აღწერა
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
            <Briefcase className="h-3.5 w-3.5" />
            ჩვენთან
          </span>
          <span className="text-[15px] font-black text-[#1E293B]">5+ წელი</span>
        </div>
        <div className="flex flex-col gap-1">
          <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.5px] text-[#94A3B8]">
            <Languages className="h-3.5 w-3.5" />
            ენები
          </span>
          <span className="text-[15px] font-black text-[#1E293B]">
            ქართული, Русский
          </span>
        </div>
        <div className="flex flex-col gap-1">
          <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.5px] text-[#94A3B8]">
            <Clock className="h-3.5 w-3.5" />
            სამუშაო საათები
          </span>
          <span className="text-[15px] font-black text-[#1E293B]">
            {service.schedule ?? "09:00 - 19:00"}
          </span>
        </div>
        <div className="flex flex-col gap-1">
          <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.5px] text-[#94A3B8]">
            <BadgeCheck className="h-3.5 w-3.5" />
            გამოცდილება
          </span>
          <span className="text-[15px] font-black text-[#1E293B]">8 წელი</span>
        </div>
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
              ვერიფიცირებული სპეციალისტი
            </h3>
            <p className="mt-1 text-[13px] leading-[20px] text-[#64748B]">
              ყველა მონაცემი გადამოწმებულია MyBakuriani-ის მიერ. ჩვენ
              ვერიფიცირებულ სერვისებს მხოლოდ საიმედო სპეციალისტებს ვაცნობებთ.
            </p>
          </div>
        </motion.div>
      )}

      {/* Price + CTA row */}
      <motion.div
        {...fadeIn}
        transition={{ duration: 0.4, delay: 0.35 }}
        className="mt-8 flex flex-col items-stretch justify-between gap-4 rounded-[20px] border border-[#E2E8F0] bg-white p-6 sm:flex-row sm:items-center"
      >
        <div className="flex items-center gap-3">
          {owner && (
            <div className="relative size-10 shrink-0 overflow-hidden rounded-full bg-[#F8FAFC]">
              {owner.avatar_url ? (
                <Image
                  src={owner.avatar_url}
                  alt={owner.display_name}
                  fill
                  className="object-cover"
                />
              ) : (
                <div className="flex size-full items-center justify-center text-sm font-medium text-[#94A3B8]">
                  {owner.display_name?.charAt(0) ?? "ს"}
                </div>
              )}
            </div>
          )}
          <div>
            {service.price != null && (
              <div>
                <span className="text-[28px] font-black leading-[32px] text-[#1E293B]">
                  {formatPrice(service.price)}
                </span>
                {service.price_unit && (
                  <span className="ml-1 text-sm text-[#94A3B8]">
                    / {service.price_unit}
                  </span>
                )}
              </div>
            )}
            <p className="text-[12px] text-[#64748B]">ფასდატვირთი ფასი</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <WhatsAppButton phone={service.phone} />
          <CallButton
            phone={service.phone}
            className="h-12 flex-1 gap-2 rounded-full bg-[#22C55E] px-8 text-[15px] font-bold text-white hover:bg-[#16A34A] sm:flex-none"
            label="დარეკვა"
            onNoPhoneClick={() => router.push("/auth/login")}
          />
        </div>
      </motion.div>
    </div>
  );
}
