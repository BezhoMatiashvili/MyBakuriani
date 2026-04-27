"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import {
  Tag,
  Briefcase,
  Wrench,
  Car,
  UtensilsCrossed,
  Map as MapIcon,
} from "lucide-react";

const CATEGORIES = [
  {
    href: "/create/rental",
    icon: Tag,
    title: "უძრავი ქონება — გაქირავება",
  },
  {
    href: "/create/sale",
    icon: Tag,
    title: "უძრავი ქონება — გაყიდვა",
  },
  {
    href: "/create/employment",
    icon: Briefcase,
    title: "დასაქმება",
  },
  {
    href: "/create/service",
    icon: Wrench,
    title: "სერვისები / ხელოსნები",
  },
  {
    href: "/create/transport",
    icon: Car,
    title: "ტრანსპორტი",
  },
  {
    href: "/create/food",
    icon: UtensilsCrossed,
    title: "კვების ობიექტები",
  },
  {
    href: "/create/entertainment",
    icon: MapIcon,
    title: "გართობა და აქტივობები",
  },
];

export default function CreatePage() {
  return (
    <div className="mx-auto w-full max-w-[880px] px-4 py-10 sm:py-12">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="rounded-[24px] border border-[#E2E8F0] bg-white p-6 shadow-[0px_1px_3px_rgba(0,0,0,0.05)] sm:p-8"
      >
        <div>
          <h1 className="text-[28px] font-black leading-8 tracking-[-0.7px] text-[#0F172A]">
            განცხადების დამატება
          </h1>
          <p className="mt-1 text-sm font-medium text-[#64748B]">
            აირჩიე კატეგორია
          </p>
        </div>

        <div className="mt-7 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {CATEGORIES.map((cat, i) => (
            <motion.div
              key={cat.href}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04, duration: 0.25 }}
            >
              <Link
                href={cat.href}
                className="group flex h-full flex-col items-center gap-3 rounded-2xl border border-[#E2E8F0] bg-white px-4 py-10 text-center transition-all hover:border-[#2563EB] hover:shadow-md"
              >
                <cat.icon
                  className="size-7 text-[#94A3B8] transition-colors group-hover:text-[#2563EB]"
                  strokeWidth={1.5}
                />
                <h2 className="text-[13px] font-semibold leading-snug text-[#334155] transition-colors group-hover:text-[#2563EB]">
                  {cat.title}
                </h2>
              </Link>
            </motion.div>
          ))}
        </div>
      </motion.div>
    </div>
  );
}
