"use client";
import { motion } from "framer-motion";
import { ArrowUp, ArrowDown } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

type ValueColor = "default" | "success" | "warning" | "accent";

interface StatCardProps {
  icon?: React.ReactNode;
  label: string;
  value: string | number;
  change: number | null;
  loading: boolean;
  valueColor?: ValueColor;
  compactOnMobile?: boolean;
}

const valueColorClass: Record<ValueColor, string> = {
  default: "text-[#0F172A]",
  success: "text-[#10B981]",
  warning: "text-[#F97316]",
  accent: "text-[#2563EB]",
};

const changeColorClass: Record<ValueColor, string> = {
  default: "bg-[#EFF6FF] text-[#2563EB]",
  success: "bg-[#ECFDF5] text-[#10B981]",
  warning: "bg-[#FFF7ED] text-[#F97316]",
  accent: "bg-[#EFF6FF] text-[#2563EB]",
};

export default function StatCard({
  label,
  value,
  change,
  loading,
  valueColor = "default",
  compactOnMobile = false,
}: StatCardProps) {
  if (loading)
    return (
      <div
        className={
          compactOnMobile
            ? "min-h-[76px] rounded-[16px] border border-[#EEF1F4] bg-white p-3 shadow-[0px_4px_12px_rgba(0,0,0,0.02)] sm:rounded-[20px] sm:p-6"
            : "rounded-[20px] border border-[#EEF1F4] bg-white p-6 shadow-[0px_4px_12px_rgba(0,0,0,0.02)]"
        }
      >
        <Skeleton className={compactOnMobile ? "mb-2 h-3 w-16 sm:mb-3 sm:w-20" : "mb-3 h-3 w-20"} />
        <Skeleton className={compactOnMobile ? "h-7 w-14 sm:h-8 sm:w-16" : "h-8 w-16"} />
      </div>
    );
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      data-compact-mobile={compactOnMobile ? "true" : undefined}
      className={
        compactOnMobile
          ? "min-h-[76px] min-w-0 rounded-[16px] border border-[#EEF1F4] bg-white p-3 shadow-[0px_4px_12px_rgba(0,0,0,0.02)] sm:rounded-[20px] sm:p-6"
          : "rounded-[20px] border border-[#EEF1F4] bg-white p-6 shadow-[0px_4px_12px_rgba(0,0,0,0.02)]"
      }
    >
      <p className="truncate text-[11px] font-bold uppercase tracking-wide text-[#64748B]">
        {label}
      </p>
      <div className={compactOnMobile ? "mt-1.5 flex min-w-0 items-baseline gap-2 sm:mt-3" : "mt-3 flex items-baseline gap-2"}>
        <span
          className={`${compactOnMobile ? "min-w-0 truncate text-[22px] leading-[28px] sm:text-[30px] sm:leading-[38px]" : "text-[30px] leading-[38px]"} font-black ${valueColorClass[valueColor]}`}
        >
          {value}
        </span>
        {change != null && (
          <span
            className={`flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[11px] font-bold ${changeColorClass[valueColor]}`}
          >
            {change >= 0 ? (
              <ArrowUp className="h-3 w-3" />
            ) : (
              <ArrowDown className="h-3 w-3" />
            )}
            {Math.abs(change)}%
          </span>
        )}
      </div>
    </motion.div>
  );
}
