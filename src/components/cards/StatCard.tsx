"use client";
import { motion } from "framer-motion";
import { ArrowUp, ArrowDown } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

interface StatCardProps {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  change: number | null;
  loading: boolean;
}

export default function StatCard({
  icon,
  label,
  value,
  change,
  loading,
}: StatCardProps) {
  if (loading)
    return (
      <div className="rounded-[20px] border border-[#EEF1F4] bg-white p-6 shadow-[0px_4px_12px_rgba(0,0,0,0.02)]">
        <Skeleton className="h-3 w-20 mb-2" />
        <Skeleton className="h-8 w-16" />
      </div>
    );
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-[20px] border border-[#EEF1F4] bg-white p-6 shadow-[0px_4px_12px_rgba(0,0,0,0.02)]"
    >
      <p className="truncate text-[11px] font-bold text-[#64748B]">{label}</p>
      <div className="mt-2 flex items-baseline gap-2">
        <span className="text-[28px] font-black leading-[38px] text-[#0F172A]">
          {value}
        </span>
        {change != null && (
          <span
            className={`flex items-center gap-0.5 text-xs font-medium ${change >= 0 ? "text-brand-success" : "text-brand-error"}`}
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
