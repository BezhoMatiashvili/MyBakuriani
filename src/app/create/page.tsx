"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import {
  Home,
  DollarSign,
  Briefcase,
  Wrench,
  Car,
  UtensilsCrossed,
  Snowflake,
} from "lucide-react";

const CATEGORIES = [
  {
    href: "/create/rental",
    icon: Home,
    title: "უძრავი ქონება — ქირაობა",
    description: "ბინა, კოტეჯი, სასტუმრო, ვილა",
    bg: "bg-brand-accent-light/10",
  },
  {
    href: "/create/sale",
    icon: DollarSign,
    title: "უძრავი ქონება — გაყიდვა",
    description: "ქონების გაყიდვა და ინვესტიცია",
    bg: "bg-emerald-500/10",
  },
  {
    href: "/create/employment",
    icon: Briefcase,
    title: "დასაქმება",
    description: "ვაკანსიები და სამუშაო შეთავაზებები",
    bg: "bg-amber-500/10",
  },
  {
    href: "/create/service",
    icon: Wrench,
    title: "სერვისები",
    description: "დალაგება, ხელოსანი და სხვა",
    bg: "bg-purple-500/10",
  },
  {
    href: "/create/transport",
    icon: Car,
    title: "ტრანსპორტი",
    description: "მძღოლის მომსახურება და გადაზიდვა",
    bg: "bg-red-500/10",
  },
  {
    href: "/create/food",
    icon: UtensilsCrossed,
    title: "კვება",
    description: "რესტორანი, კაფე, მიტანის სერვისი",
    bg: "bg-orange-500/10",
  },
  {
    href: "/create/entertainment",
    icon: Snowflake,
    title: "გართობა",
    description: "სათხილამურო, ტურები, აქტივობები",
    bg: "bg-cyan-500/10",
  },
];

export default function CreatePage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-12">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-8"
      >
        <div className="text-center">
          <h1 className="text-[28px] font-black leading-8 tracking-[-0.7px] text-[#1E293B]">
            განცხადების დამატება
          </h1>
          <p className="mt-2 text-sm font-medium text-[#64748B]">
            აირჩიეთ კატეგორია თქვენი განცხადებისთვის
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {CATEGORIES.map((cat, i) => (
            <motion.div
              key={cat.href}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
            >
              <Link
                href={cat.href}
                className="group flex flex-col items-center gap-3 rounded-2xl border-2 border-[#E2E8F0] bg-white p-6 text-center transition-all hover:border-brand-accent/30 hover:shadow-md"
              >
                <div
                  className={`flex size-[30px] items-center justify-center ${cat.bg}`}
                >
                  <cat.icon className="size-[30px] text-[#94A3B8]" />
                </div>
                <h2 className="text-sm font-semibold text-[#475569]">
                  {cat.title}
                </h2>
                <p className="text-sm text-[#94A3B8]">{cat.description}</p>
              </Link>
            </motion.div>
          ))}
        </div>
      </motion.div>
    </div>
  );
}
