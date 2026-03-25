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
    <div className="inline-flex rounded-full bg-muted p-1">
      {options.map((option) => {
        const isActive = value === option.key;
        return (
          <button
            key={option.key}
            type="button"
            onClick={() => onChange(option.key)}
            className={cn(
              "relative rounded-full px-5 py-2 text-sm font-medium transition-colors",
              isActive
                ? "text-white"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {isActive && (
              <motion.span
                layoutId="rent-buy-pill"
                className="absolute inset-0 rounded-full bg-blue-600"
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
