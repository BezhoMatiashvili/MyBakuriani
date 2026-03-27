"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface RentBuyToggleProps {
  value: "rent" | "sale";
  onChange: (value: "rent" | "sale") => void;
}

const options = [
  { key: "rent" as const, label: "ქირაობა" },
  { key: "sale" as const, label: "ყიდვა-გაყიდვა" },
];

export function RentBuyToggle({ value, onChange }: RentBuyToggleProps) {
  return (
    <div className="inline-flex h-[54px] items-center rounded-full border border-white/5 bg-[#1F2A44] p-1.5 shadow-[0px_10px_15px_-3px_rgba(0,0,0,0.1),0px_4px_6px_-4px_rgba(0,0,0,0.1)]">
      {options.map((option) => {
        const isActive = value === option.key;
        return (
          <button
            key={option.key}
            type="button"
            onClick={() => onChange(option.key)}
            className={cn(
              "relative h-[40px] rounded-full px-8 text-sm transition-colors",
              isActive
                ? "font-bold text-white"
                : "font-medium text-[#CBD5E1] hover:text-white/80",
            )}
          >
            {isActive && (
              <motion.span
                layoutId="rent-buy-pill"
                className="absolute inset-0 rounded-full bg-brand-accent shadow-[0px_1px_2px_rgba(0,0,0,0.05)]"
                transition={{ type: "spring", bounce: 0.2, duration: 0.4 }}
              />
            )}
            <span className="relative z-10">{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}
