"use client";

import { useState, type ReactNode } from "react";
import { SlidersHorizontal } from "lucide-react";
import BottomSheet from "@/components/shared/BottomSheet";

interface ResponsiveFilterSheetProps {
  title: string;
  selectedLabels: string[];
  children: ReactNode;
}

/** Phone filter trigger + sheet, with the caller's existing panel preserved from sm up. */
export function ResponsiveFilterSheet({
  title,
  selectedLabels,
  children,
}: ResponsiveFilterSheetProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <section className="relative z-10 -mt-6 px-4 sm:hidden">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex min-h-11 w-full items-center justify-between rounded-2xl border border-[#E2E8F0] bg-white px-4 text-sm font-bold text-[#334155] shadow-[0px_8px_24px_-10px_rgba(15,23,42,0.25)]"
        >
          <span>{title}</span>
          <SlidersHorizontal className="size-4 text-[#2563EB]" />
        </button>
        {selectedLabels.length > 0 && (
          <div className="scrollbar-hide -mx-4 mt-3 flex gap-2 overflow-x-auto px-4">
            {selectedLabels.map((label) => (
              <span
                key={label}
                className="shrink-0 rounded-full border border-[#DBEAFE] bg-[#EFF6FF] px-3 py-1.5 text-xs font-bold text-[#2563EB]"
              >
                {label}
              </span>
            ))}
          </div>
        )}
      </section>

      <section className="hidden px-4 sm:block">{children}</section>

      <BottomSheet isOpen={open} onClose={() => setOpen(false)} title={title}>
        <div className="[&>div]:!m-0 [&>div]:!rounded-none [&>div]:!p-0 [&>div]:!shadow-none">
          {children}
        </div>
      </BottomSheet>
    </>
  );
}
