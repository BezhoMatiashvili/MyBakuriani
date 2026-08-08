"use client";

import { Clock } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import {
  formatRelativeGe,
  isListingNewlyAdded,
} from "@/lib/utils/format";

interface ListingRecencyProps {
  createdAt: string | null;
  className?: string;
}

export function ListingAgeBadge({
  createdAt,
  className,
}: ListingRecencyProps) {
  const locale = useLocale();
  const label = formatRelativeGe(createdAt, locale);
  if (!label) return null;

  return (
    <time
      dateTime={createdAt ?? undefined}
      data-listing-age
      suppressHydrationWarning
      className={cn(
        "inline-flex min-w-0 shrink-0 items-center gap-1 whitespace-nowrap rounded-full bg-[#F8FAFC] px-2 py-1 text-[10px] font-bold leading-none text-[#94A3B8]",
        className,
      )}
    >
      <Clock aria-hidden className="size-3 shrink-0" />
      <span>{label}</span>
    </time>
  );
}

export function NewlyAddedBadge({
  createdAt,
  className,
}: ListingRecencyProps) {
  const t = useTranslations("Shared");
  if (!isListingNewlyAdded(createdAt)) return null;

  return (
    <span
      data-newly-added
      suppressHydrationWarning
      className={cn(
        "inline-flex items-center rounded-full bg-[#22C55E] px-2.5 py-1 text-[9px] font-bold leading-none text-white shadow-[0px_1px_2px_rgba(0,0,0,0.12)]",
        className,
      )}
    >
      {t("newlyAdded")}
    </span>
  );
}
