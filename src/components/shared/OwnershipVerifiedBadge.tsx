"use client";

import { ShieldCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

// The public "ownership verified" mark (C39). Navy brand-primary, a colour no other listing badge
// uses; the white ring and shadow keep it readable on dark photos. Never an <a>, <button>, <h2>
// or <h3>: the card-geometry spec finds card titles and CTAs by those tags.
const PILL =
  "inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-brand-primary text-white ring-1 ring-white/90 shadow-[0_1px_3px_rgba(0,0,0,0.3)]";

interface OwnershipVerifiedBadgeProps {
  variant: "card" | "icon" | "detail";
  className?: string;
}

export function OwnershipVerifiedBadge({
  variant,
  className,
}: OwnershipVerifiedBadgeProps) {
  const t = useTranslations("Shared");
  const full = t("ownershipVerified.full");

  if (variant === "icon") {
    return (
      <span
        data-ownership-verified=""
        role="img"
        aria-label={full}
        title={full}
        className={cn(PILL, "size-6 shrink-0 justify-center", className)}
      >
        <ShieldCheck aria-hidden className="size-3.5" />
      </span>
    );
  }

  if (variant === "card") {
    return (
      <span
        data-ownership-verified=""
        className={cn(
          PILL,
          "h-5 shrink-0 px-1.5 text-[11px] font-semibold leading-4",
          className,
        )}
      >
        <ShieldCheck aria-hidden className="size-3 shrink-0" />
        {/* Truncates only where a caller lets the pill shrink; leading-4
            keeps Georgian ascenders inside the clipped line box. */}
        <span aria-hidden className="min-w-0 truncate">
          {t("ownershipVerified.short")}
        </span>
        <span className="sr-only">{full}</span>
      </span>
    );
  }

  return (
    <details data-ownership-verified="" className={className}>
      <summary className="inline-flex min-h-11 cursor-pointer list-none flex-wrap items-center gap-x-2 gap-y-1 rounded-md [&::-webkit-details-marker]:hidden">
        <span className={cn(PILL, "h-7 px-2.5 text-[13px] font-semibold")}>
          <ShieldCheck aria-hidden className="size-4 shrink-0" />
          {full}
        </span>
        <span className="text-[12px] font-medium text-[#64748B] underline decoration-dotted underline-offset-2">
          {t("ownershipVerified.more")}
        </span>
      </summary>
      <div className="mt-1 flex max-w-md items-start gap-2.5 rounded-[16px] border border-[#E2E8F0] bg-[#F8FAFC] p-4">
        <ShieldCheck
          aria-hidden
          className="mt-0.5 size-4 shrink-0 text-brand-primary"
        />
        <div className="text-[13px] leading-5">
          <p className="font-bold text-[#1E293B]">{full}</p>
          <p className="mt-1 text-[#64748B]">
            {t("ownershipVerified.explanation")}
          </p>
        </div>
      </div>
    </details>
  );
}
