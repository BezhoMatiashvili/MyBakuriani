"use client";

import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

type Status = "active" | "blocked" | "pending" | "verified";

interface StatusBadgeProps {
  status: Status;
  className?: string;
}

const statusConfig: Record<Status, { classes: string }> = {
  active: {
    classes:
      "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  },
  blocked: {
    classes: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  },
  pending: {
    classes:
      "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  },
  verified: {
    classes: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  },
};

export default function StatusBadge({ status, className }: StatusBadgeProps) {
  const t = useTranslations("StatusBadge");
  const config = statusConfig[status];

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        config.classes,
        className,
      )}
    >
      {t(status)}
    </span>
  );
}
