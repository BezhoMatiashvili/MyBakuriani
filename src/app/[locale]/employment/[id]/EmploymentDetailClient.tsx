"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  BadgeCheck,
  Briefcase,
  MapPin,
  Banknote,
  Clock,
  Building2,
  Upload,
  CheckCircle2,
  FileText,
  MessageCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import type { Tables } from "@/lib/types/database";

type ServiceWithOwner = Tables<"services"> & {
  profiles: Tables<"profiles"> | null;
};

interface Props {
  service: ServiceWithOwner;
}

const fadeIn = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.4 },
};

const REQUIREMENTS = [
  "საშუალო განათლების პრიორიტეტი",
  "სუფთა საქმიანობის დარეგულების და ფიზიკური გამძლეობა",
  "კლიენტებთან კომუნიკაციის უნარი",
];

export default function EmploymentDetailClient({ service }: Props) {
  const router = useRouter();
  const owner = service.profiles;

  useEffect(() => {
    const supabase = createClient();
    supabase
      .from("services")
      .update({ views_count: (service.views_count ?? 0) + 1 })
      .eq("id", service.id)
      .then();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [service.id]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:py-8">
      <div className="mb-6 flex items-center justify-between">
        <motion.button
          {...fadeIn}
          onClick={() => router.back()}
          className="flex items-center gap-1.5 text-sm text-[#64748B] transition-colors hover:text-[#1E293B]"
        >
          <ArrowLeft className="h-4 w-4" />
          უკან დაბრუნება
        </motion.button>
        <motion.div
          {...fadeIn}
          className="text-[12px] font-medium text-[#64748B]"
        >
          დასაქმების წილი
        </motion.div>
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_320px]">
        <div>
          {/* Badges */}
          <motion.div
            {...fadeIn}
            transition={{ duration: 0.4, delay: 0.1 }}
            className="mb-3 flex items-center gap-2"
          >
            <span className="rounded-md bg-[#DBEAFE] px-2 py-1 text-[11px] font-bold uppercase tracking-[0.5px] text-[#2563EB]">
              ვაკანსია
            </span>
            <span className="rounded-md bg-[#FEE2E2] px-2 py-1 text-[11px] font-bold uppercase tracking-[0.5px] text-[#DC2626]">
              NEW
            </span>
          </motion.div>

          {/* Title */}
          <motion.h1
            {...fadeIn}
            transition={{ duration: 0.4, delay: 0.15 }}
            className="text-[32px] font-black leading-[40px] text-[#1E293B] sm:text-[40px] sm:leading-[48px]"
          >
            {service.title}
          </motion.h1>

          {/* Company */}
          <motion.div
            {...fadeIn}
            transition={{ duration: 0.4, delay: 0.2 }}
            className="mt-3 flex items-center gap-2"
          >
            <Building2 className="h-4 w-4 text-[#2563EB]" />
            <span className="flex items-center gap-1.5 text-[14px] font-medium text-[#1E293B]">
              {owner?.display_name ?? "Crystal Resort Management"}
              {owner?.is_verified && (
                <BadgeCheck className="h-4 w-4 text-[#2563EB]" />
              )}
            </span>
            <span className="text-[13px] text-[#94A3B8]">
              · {service.location ?? "ბაკურიანი"}
            </span>
          </motion.div>

          {/* Stats grid */}
          <motion.div
            {...fadeIn}
            transition={{ duration: 0.4, delay: 0.25 }}
            className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4"
          >
            <div className="rounded-[16px] border border-[#E2E8F0] bg-white p-4">
              <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.5px] text-[#94A3B8]">
                <MapPin className="h-3.5 w-3.5" />
                ლოკაცია
              </div>
              <p className="mt-1 text-[15px] font-black text-[#1E293B]">
                {service.location ?? "დიდგორი"}
              </p>
            </div>
            <div className="rounded-[16px] border border-[#E2E8F0] bg-[#F0FDF4] p-4">
              <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.5px] text-[#16A34A]">
                <Banknote className="h-3.5 w-3.5" />
                ანაზღაურება
              </div>
              <p className="mt-1 text-[15px] font-black text-[#16A34A]">
                {service.salary_range ?? "60 ₾ / დღეში"}
              </p>
            </div>
            <div className="rounded-[16px] border border-[#E2E8F0] bg-white p-4">
              <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.5px] text-[#94A3B8]">
                <Clock className="h-3.5 w-3.5" />
                გრაფიკი
              </div>
              <p className="mt-1 text-[15px] font-black text-[#1E293B]">
                {service.employment_schedule ?? "მოქნილი"}
              </p>
            </div>
            <div className="rounded-[16px] border border-[#E2E8F0] bg-white p-4">
              <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.5px] text-[#94A3B8]">
                <Briefcase className="h-3.5 w-3.5" />
                სფერო
              </div>
              <p className="mt-1 text-[15px] font-black text-[#1E293B]">
                {service.position ?? "სასტუმრო"}
              </p>
            </div>
          </motion.div>

          {/* Description */}
          {service.description && (
            <motion.div
              {...fadeIn}
              transition={{ duration: 0.4, delay: 0.3 }}
              className="mt-8"
            >
              <h2 className="mb-3 text-[20px] font-black leading-[30px] text-[#0F172A]">
                სამუშაოს აღწერა
              </h2>
              <p className="whitespace-pre-line text-[15px] font-medium leading-[27px] text-[#475569]">
                {service.description}
              </p>
            </motion.div>
          )}

          {/* Requirements */}
          <motion.div
            {...fadeIn}
            transition={{ duration: 0.4, delay: 0.35 }}
            className="mt-8"
          >
            <h2 className="mb-4 text-[20px] font-black leading-[30px] text-[#0F172A]">
              მოთხოვნები და კომპეტენცია
            </h2>
            <ul className="space-y-3">
              {REQUIREMENTS.map((req) => (
                <li key={req} className="flex items-start gap-3">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-[#22C55E]" />
                  <span className="text-[14px] font-medium text-[#475569]">
                    {req}
                  </span>
                </li>
              ))}
            </ul>
          </motion.div>

          {/* Verified callout */}
          {owner?.is_verified && (
            <motion.div
              {...fadeIn}
              transition={{ duration: 0.4, delay: 0.4 }}
              className="mt-8 rounded-[16px] border border-[#DBEAFE] bg-[#F0F7FF] p-4"
            >
              <p className="text-[13px] text-[#2563EB]">
                <span className="font-black">ვერიფიცირებული სპეციალისტი.</span>{" "}
                კომპანიის ყველა დეტალი გადამოწმებულია MyBakuriani-ის მიერ. რათა
                გაუმჯობესოთ სამუშო ქონის დაცული მარჯვნივ.
              </p>
            </motion.div>
          )}

          {/* Application form */}
          <motion.div
            {...fadeIn}
            transition={{ duration: 0.4, delay: 0.45 }}
            className="mt-10 rounded-[24px] border border-[#E2E8F0] bg-white p-6 sm:p-8"
          >
            <h2 className="mb-2 text-center text-[22px] font-black text-[#1E293B]">
              გამოხმაურე ვაკანსიას
            </h2>
            <p className="mb-6 text-center text-[13px] text-[#64748B]">
              შეავსე ფორმა და დამსაქმებელი თქვენთან დაკავშირდება
            </p>

            {/* CV upload */}
            <div className="mb-6 rounded-[16px] border-2 border-dashed border-[#DBEAFE] bg-[#F0F7FF] p-6 text-center">
              <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-[#2563EB] text-white">
                <Upload className="h-5 w-5" />
              </div>
              <p className="text-[14px] font-black text-[#1E293B]">
                ატვირთე რეზიუმე (CV)
              </p>
              <p className="mt-1 text-[12px] text-[#64748B]">
                PDF ან DOCX ფორმატი, მაქს. 10 მბ
              </p>
              <button
                type="button"
                className="mt-3 inline-flex items-center gap-1.5 text-[12px] font-bold text-[#2563EB] hover:underline"
              >
                <FileText className="h-3.5 w-3.5" />
                CV-ის უფოფი ფოტო გენერირება ან ფაილის ატვირთვა
              </button>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-[12px] font-medium text-[#64748B]">
                  სახელი და გვარი *
                </label>
                <input
                  type="text"
                  className="h-11 w-full rounded-[12px] border border-[#E2E8F0] bg-white px-3 text-sm outline-none focus:border-[#2563EB]"
                  placeholder="შენი სახელი"
                />
              </div>
              <div>
                <label className="mb-1 block text-[12px] font-medium text-[#64748B]">
                  ტელეფონის ნომერი *
                </label>
                <input
                  type="tel"
                  className="h-11 w-full rounded-[12px] border border-[#E2E8F0] bg-white px-3 text-sm outline-none focus:border-[#2563EB]"
                  placeholder="+995 5X XX XX XX"
                />
              </div>
              <div>
                <label className="mb-1 block text-[12px] font-medium text-[#64748B]">
                  დაწყების სასურველი თარიღი *
                </label>
                <input
                  type="date"
                  className="h-11 w-full rounded-[12px] border border-[#E2E8F0] bg-white px-3 text-sm outline-none focus:border-[#2563EB]"
                />
              </div>
              <div>
                <label className="mb-1 block text-[12px] font-medium text-[#64748B]">
                  ანაზღაურება (სასურველი)
                </label>
                <input
                  type="text"
                  className="h-11 w-full rounded-[12px] border border-[#E2E8F0] bg-white px-3 text-sm outline-none focus:border-[#2563EB]"
                  placeholder="ფასი"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="mb-1 block text-[12px] font-medium text-[#64748B]">
                  საცხოვრებელი ლოკაცია *
                </label>
                <input
                  type="text"
                  className="h-11 w-full rounded-[12px] border border-[#E2E8F0] bg-white px-3 text-sm outline-none focus:border-[#2563EB]"
                  placeholder="მიუთითე ლოკაცია"
                />
              </div>
              <div className="sm:col-span-2">
                <div className="mb-2 text-[12px] font-medium text-[#64748B]">
                  ენები
                </div>
                <div className="flex flex-wrap gap-2">
                  {["ქართული", "ინგლისური", "რუსული"].map((lang) => (
                    <label
                      key={lang}
                      className="flex cursor-pointer items-center gap-2 rounded-full border border-[#E2E8F0] bg-white px-4 py-2 text-[13px] transition-colors has-[:checked]:border-[#2563EB] has-[:checked]:bg-[#DBEAFE] has-[:checked]:text-[#2563EB]"
                    >
                      <input type="checkbox" className="sr-only" />
                      {lang}
                    </label>
                  ))}
                </div>
              </div>
              <div className="sm:col-span-2">
                <label className="mb-1 block text-[12px] font-medium text-[#64748B]">
                  დამატებითი შეტყობინება
                </label>
                <textarea
                  rows={3}
                  className="w-full rounded-[12px] border border-[#E2E8F0] bg-white px-3 py-2 text-sm outline-none focus:border-[#2563EB]"
                  placeholder="ხელი მოგვიწერეთ რაიმე დამატებითი ინფო..."
                />
              </div>
            </div>

            <Button
              onClick={() => router.push("/auth/login")}
              className="mt-6 h-12 w-full gap-2 rounded-full bg-[#2563EB] text-[15px] font-bold text-white hover:bg-[#1D4ED8]"
            >
              <Briefcase className="h-4 w-4" />
              ვაკანსიის გაგზავნა
            </Button>
          </motion.div>
        </div>

        {/* Sidebar */}
        <motion.aside
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.4, delay: 0.2 }}
          className="space-y-4"
        >
          <div className="sticky top-24 rounded-[20px] border border-[#E2E8F0] bg-white p-6">
            <h3 className="mb-4 text-[11px] font-bold uppercase tracking-[0.5px] text-[#94A3B8]">
              დამსაქმებლის პროფილი
            </h3>
            <div className="mb-4 flex items-center gap-3">
              <div className="relative size-12 shrink-0 overflow-hidden rounded-full bg-[#F8FAFC]">
                {owner?.avatar_url ? (
                  <Image
                    src={owner.avatar_url}
                    alt={owner.display_name}
                    fill
                    className="object-cover"
                  />
                ) : (
                  <div className="flex size-full items-center justify-center text-sm font-medium text-[#94A3B8]">
                    {owner?.display_name?.charAt(0) ?? "დ"}
                  </div>
                )}
              </div>
              <div>
                <p className="text-[14px] font-black text-[#1E293B]">
                  {owner?.display_name ?? "Crystal Resort Management"}
                </p>
                <p className="text-[12px] text-[#94A3B8]">1 ქცრ რეაი</p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="h-10 flex-1 rounded-full border-[#E2E8F0] text-[13px] font-bold"
              >
                ფილრო
              </Button>
              <Button className="h-10 flex-1 gap-1.5 rounded-full bg-[#2563EB] text-[13px] font-bold text-white hover:bg-[#1D4ED8]">
                <MessageCircle className="h-3.5 w-3.5" />
                მესიჯი
              </Button>
            </div>
          </div>
        </motion.aside>
      </div>
    </div>
  );
}
