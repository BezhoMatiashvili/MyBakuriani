"use client";

import { Clock, Sparkles } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { LISTING_PILL } from "@/components/shared/listingPill";
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

  // Built like the green "verified" card pill (icon + text, px-3, 12 px icon,
  // 6 px gap at 11 px). Icon and gap are in em so a caller's smaller phone
  // text (the /food grid's 8 px) shrinks them too; truncation happens on the
  // label, since an ellipsis on the flex parent does not show beside the icon.
  return (
    <span
      data-newly-added
      suppressHydrationWarning
      className={cn(LISTING_PILL, "gap-[0.55em] bg-[#2563EB] px-3", className)}
    >
      <Sparkles aria-hidden className="size-[1.1em] shrink-0" />
      <span className="min-w-0 truncate">{t("newlyAdded")}</span>
    </span>
  );
}
