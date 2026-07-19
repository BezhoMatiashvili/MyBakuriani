"use client";

import { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface MobileStickyCTAProps {
  primary: ReactNode;
  secondary?: ReactNode;
  ctaLabel: string;
  onClick: () => void;
  tone?: "booking" | "contact" | "application";
}

export function MobileStickyCTA({
  primary,
  secondary,
  ctaLabel,
  onClick,
  tone = "booking",
}: MobileStickyCTAProps) {
  return (
    // lg:hidden (not md:hidden): the detail-page sidebars this bar hands off
    // to only become sticky at lg: (1024px) — hiding this at md: (768px)
    // left a 768-1023px gap with no persistent price/CTA at all.
    <div className="fixed inset-x-0 bottom-0 z-30 flex items-center justify-between gap-3 border-t border-[#E2E8F0] bg-white/95 px-4 py-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] backdrop-blur-sm lg:hidden">
      <div className="min-w-0">
        <div className="truncate text-[18px] font-black leading-tight text-[#1E293B]">
          {primary}
        </div>
        {secondary && (
          <div className="truncate text-[12px] font-medium text-[#64748B]">
            {secondary}
          </div>
        )}
      </div>
      <button
        type="button"
        onClick={onClick}
        data-slot="mobile-sticky-cta"
        data-tone={tone}
        className={cn(
          "shrink-0 rounded-xl px-6 py-3 text-[14px] font-bold text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
          tone === "booking" && "bg-creation hover:bg-creation-hover focus-visible:ring-creation/35",
          tone === "contact" && "bg-contact hover:bg-contact-hover focus-visible:ring-contact/35",
          tone === "application" && "bg-[#2563EB] hover:bg-[#1D4ED8] focus-visible:ring-[#2563EB]/35",
        )}
      >
        {ctaLabel}
      </button>
    </div>
  );
}
