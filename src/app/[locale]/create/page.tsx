"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { useTranslations } from "next-intl";
import {
  Tag,
  Briefcase,
  Wrench,
  Car,
  UtensilsCrossed,
  Map as MapIcon,
} from "lucide-react";

const CATEGORIES = [
  { href: "/create/rental", icon: Tag, key: "rental" },
  { href: "/create/sale", icon: Tag, key: "sale" },
  { href: "/create/employment", icon: Briefcase, key: "employment" },
  { href: "/create/service", icon: Wrench, key: "service" },
  { href: "/create/transport", icon: Car, key: "transport" },
  { href: "/create/food", icon: UtensilsCrossed, key: "food" },
  { href: "/create/entertainment", icon: MapIcon, key: "entertainment" },
] as const;

export default function CreatePage() {
  const t = useTranslations("CreateHub");
  return (
    <div className="mx-auto w-full max-w-[880px] px-4 py-6 lg:py-12">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="bg-transparent p-0 lg:rounded-[24px] lg:border lg:border-[#E2E8F0] lg:bg-white lg:p-8 lg:shadow-[0px_1px_3px_rgba(0,0,0,0.05)]"
      >
        <div>
          <h1 className="text-[24px] font-black leading-8 tracking-[-0.5px] text-[#0F172A] lg:text-[28px] lg:tracking-[-0.7px]">
            {t("title")}
          </h1>
          <p className="mt-1 text-sm font-medium text-[#64748B]">
            {t("subtitle")}
          </p>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-3 lg:mt-7 lg:grid-cols-3 lg:gap-4">
          {CATEGORIES.map((cat, i) => (
            <motion.div
              key={cat.href}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04, duration: 0.25 }}
            >
              <Link
                href={cat.href}
                className="group flex min-h-[132px] h-full flex-col items-center justify-center gap-3 rounded-2xl border border-[#E2E8F0] bg-white px-3 py-5 text-center transition-all hover:border-[#2563EB] hover:shadow-md lg:px-4 lg:py-10"
              >
                <cat.icon
                  className="size-7 text-[#94A3B8] transition-colors group-hover:text-[#2563EB]"
                  strokeWidth={1.5}
                />
                <h2 className="text-[13px] font-semibold leading-snug text-[#334155] transition-colors group-hover:text-[#2563EB]">
                  {t(`categories.${cat.key}`)}
                </h2>
              </Link>
            </motion.div>
          ))}
        </div>
      </motion.div>
    </div>
  );
}
