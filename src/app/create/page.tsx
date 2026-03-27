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
    color: "text-brand-accent",
    bg: "bg-brand-accent-light/10",
  },
  {
    href: "/create/sale",
    icon: DollarSign,
    title: "უძრავი ქონება — გაყიდვა",
    description: "ქონების გაყიდვა და ინვესტიცია",
    color: "text-emerald-500",
    bg: "bg-emerald-500/10",
  },
  {
    href: "/create/employment",
    icon: Briefcase,
    title: "დასაქმება",
    description: "ვაკანსიები და სამუშაო შეთავაზებები",
    color: "text-amber-500",
    bg: "bg-amber-500/10",
  },
  {
    href: "/create/service",
    icon: Wrench,
    title: "სერვისები",
    description: "დალაგება, ხელოსანი და სხვა",
    color: "text-purple-500",
    bg: "bg-purple-500/10",
  },
  {
    href: "/create/transport",
    icon: Car,
    title: "ტრანსპორტი",
    description: "მძღოლის მომსახურება და გადაზიდვა",
    color: "text-red-500",
    bg: "bg-red-500/10",
  },
  {
    href: "/create/food",
    icon: UtensilsCrossed,
    title: "კვება",
    description: "რესტორანი, კაფე, მიტანის სერვისი",
    color: "text-orange-500",
    bg: "bg-orange-500/10",
  },
  {
    href: "/create/entertainment",
    icon: Snowflake,
    title: "გართობა",
    description: "სათხილამურო, ტურები, აქტივობები",
    color: "text-cyan-500",
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
        {/* Header */}
        <div className="text-center">
          <h1 className="text-3xl font-bold">განცხადების დამატება</h1>
          <p className="mt-2 text-muted-foreground">
            აირჩიეთ კატეგორია თქვენი განცხადებისთვის
          </p>
        </div>

        {/* Category grid */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {CATEGORIES.map((cat, index) => (
            <motion.div
              key={cat.href}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
            >
              <Link
                href={cat.href}
                className="group flex flex-col items-center gap-3 rounded-2xl border bg-card p-6 text-center shadow-sm transition-all hover:border-brand-accent/30 hover:shadow-md"
              >
                <div
                  className={`flex size-14 items-center justify-center rounded-xl ${cat.bg}`}
                >
                  <cat.icon className={`size-7 ${cat.color}`} />
                </div>
                <h2 className="font-semibold">{cat.title}</h2>
                <p className="text-sm text-muted-foreground">
                  {cat.description}
                </p>
              </Link>
            </motion.div>
          ))}
        </div>
      </motion.div>
    </div>
  );
}
