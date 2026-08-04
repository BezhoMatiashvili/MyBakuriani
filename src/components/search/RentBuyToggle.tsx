"use client";

import { Home, Building2 } from "lucide-react";
import { motion } from "framer-motion";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

interface RentBuyToggleProps {
  value: "rent" | "sale";
  onChange: (value: "rent" | "sale") => void;
  phoneLayout?: "default" | "landing-compact";
}

const options = [
  { key: "rent" as const, tKey: "rent" as const, icon: Home },
  { key: "sale" as const, tKey: "buy" as const, icon: Building2 },
];

export function RentBuyToggle({
  value,
  onChange,
  phoneLayout = "default",
}: RentBuyToggleProps) {
  const t = useTranslations("RentBuyToggle");
  const isLandingCompact = phoneLayout === "landing-compact";

  return (
    <div
      className={cn(
        "max-w-full items-center",
        isLandingCompact
          ? "grid h-11 w-[294px] grid-cols-[5fr_7fr] gap-2 bg-transparent p-0 sm:inline-flex sm:h-[54px] sm:w-auto sm:gap-0 sm:rounded-full sm:border sm:border-white/5 sm:bg-[#1F2A44] sm:p-[7px] sm:shadow-[0px_10px_15px_-3px_rgba(0,0,0,0.1),0px_4px_6px_-4px_rgba(0,0,0,0.1)]"
          : "inline-flex h-[54px] rounded-full border border-white/5 bg-[#1F2A44] p-[7px] shadow-[0px_10px_15px_-3px_rgba(0,0,0,0.1),0px_4px_6px_-4px_rgba(0,0,0,0.1)]",
      )}
    >
      {options.map((option) => {
        const isActive = value === option.key;
        const Icon = option.icon;
        return (
          <button
            key={option.key}
            type="button"
            data-listing-mode={option.key}
            onClick={() => onChange(option.key)}
            className={cn(
              "relative flex min-w-0 items-center justify-center gap-1 rounded-full px-2 text-[12px] transition-colors sm:flex-none sm:gap-2 sm:px-8 sm:text-[14px]",
              isLandingCompact
                ? "h-11 w-full flex-none sm:h-[40px] sm:w-auto"
                : "h-[40px] flex-initial",
              isActive
                ? "font-bold text-white"
                : "font-medium text-[#CBD5E1] hover:text-[#E2E8F0]",
            )}
          >
            {isLandingCompact && (
              <span className="absolute inset-x-0 inset-y-0.5 rounded-full bg-[#1F2A44] sm:hidden" />
            )}
            {isActive && (
              <motion.span
                layoutId="rent-buy-pill"
                className={cn(
                  "absolute rounded-full bg-[#2563EB] shadow-[0px_1px_2px_rgba(0,0,0,0.05)]",
                  isLandingCompact
                    ? "inset-x-0 inset-y-0.5 sm:inset-0"
                    : "inset-0",
                )}
                transition={{ type: "spring", bounce: 0.2, duration: 0.4 }}
              />
            )}
            <Icon className="relative z-10 size-4 shrink-0" />
            <span className="relative z-10 truncate">{t(option.tKey)}</span>
          </button>
        );
      })}
    </div>
  );
}
