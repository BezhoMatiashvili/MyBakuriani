"use client";

import { ReactNode } from "react";

interface MobileStickyCTAProps {
  primary: ReactNode;
  secondary?: ReactNode;
  ctaLabel: string;
  onClick: () => void;
  ctaClassName?: string;
}

export function MobileStickyCTA({
  primary,
  secondary,
  ctaLabel,
  onClick,
  ctaClassName,
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
        className={
          ctaClassName ??
          "shrink-0 rounded-xl bg-[#F97316] px-6 py-3 text-[14px] font-bold text-white transition-colors hover:bg-[#EA580C]"
        }
      >
        {ctaLabel}
      </button>
    </div>
  );
}
