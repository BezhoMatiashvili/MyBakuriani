"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface DiscountBadgeProps {
  percent: number;
  className?: string;
}

export default function DiscountBadge({
  percent,
  className,
}: DiscountBadgeProps) {
  return (
    <motion.span
      initial={{ scale: 0 }}
      animate={{ scale: 1 }}
      transition={{ type: "spring", stiffness: 500, damping: 15 }}
      className={cn(
        "inline-flex items-center rounded-full bg-red-600 px-2.5 py-0.5 text-xs font-bold text-white",
        className,
      )}
    >
      -{percent}%
    </motion.span>
  );
}
