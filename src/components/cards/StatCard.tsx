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
  if (loading) {
    return (
      <div className="rounded-[var(--radius-card)] bg-brand-surface p-5 shadow-[var(--shadow-card)]">
        <div className="flex items-center gap-3">
          <Skeleton className="h-10 w-10 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-6 w-16" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="rounded-[var(--radius-card)] bg-brand-surface p-5 shadow-[var(--shadow-card)]"
    >
      <div className="flex items-center gap-3">
        {/* Icon */}
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-accent-light text-brand-accent">
          {icon}
        </div>

        <div className="min-w-0 flex-1">
          {/* Label */}
          <p className="truncate text-xs text-muted-foreground">{label}</p>

          {/* Value + change */}
          <div className="mt-0.5 flex items-baseline gap-2">
            <span className="text-xl font-bold text-foreground">{value}</span>

            {change != null && (
              <span
                className={`flex items-center gap-0.5 text-xs font-medium ${
                  change >= 0 ? "text-brand-success" : "text-brand-error"
                }`}
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
        </div>
      </div>
    </motion.div>
  );
}
