"use client";

import { Home, Building2 } from "lucide-react";
import { motion } from "framer-motion";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

interface RentBuyToggleProps {
  value: "rent" | "sale";
  onChange: (value: "rent" | "sale") => void;
}

const options = [
  { key: "rent" as const, tKey: "rent" as const, icon: Home },
  { key: "sale" as const, tKey: "buy" as const, icon: Building2 },
];

export function RentBuyToggle({ value, onChange }: RentBuyToggleProps) {
  const t = useTranslations("RentBuyToggle");
  return (
    <div className="inline-flex h-[54px] items-center rounded-full border border-white/5 bg-[#1F2A44] p-[7px] shadow-[0px_10px_15px_-3px_rgba(0,0,0,0.1),0px_4px_6px_-4px_rgba(0,0,0,0.1)]">
      {options.map((option) => {
        const isActive = value === option.key;
        const Icon = option.icon;
        return (
          <button
            key={option.key}
            type="button"
            onClick={() => onChange(option.key)}
            className={cn(
              "relative flex h-[40px] items-center gap-2 rounded-full px-8 text-[14px] transition-colors",
              isActive
                ? "font-bold text-white"
                : "font-medium text-[#CBD5E1] hover:text-[#E2E8F0]",
            )}
          >
            {isActive && (
              <motion.span
                layoutId="rent-buy-pill"
                className="absolute inset-0 rounded-full bg-[#2563EB] shadow-[0px_1px_2px_rgba(0,0,0,0.05)]"
                transition={{ type: "spring", bounce: 0.2, duration: 0.4 }}
              />
            )}
            <Icon className="relative z-10 size-4" />
            <span className="relative z-10">{t(option.tKey)}</span>
          </button>
        );
      })}
    </div>
  );
}
