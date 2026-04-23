"use client";

import { useEffect, useRef, useState } from "react";
import { Link } from "@/i18n/navigation";
import { Check, Settings } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface SwitcherItem {
  key: string;
  label: string;
  href: string;
}

const ALL_ITEMS: SwitcherItem[] = [
  {
    key: "renter",
    label: "ბინები (გაქირავება)",
    href: "/dashboard/renter",
  },
  { key: "employment", label: "დასაქმება", href: "/dashboard/service" },
  {
    key: "service",
    label: "ტრანსპორტი / სერვისი / დასაქმება / გართობა",
    href: "/dashboard/service",
  },
  { key: "seller", label: "ბინები (გაყიდვა)", href: "/dashboard/seller" },
  { key: "food", label: "კვება", href: "/dashboard/food" },
  { key: "guest", label: "სტუმარი", href: "/dashboard/guest" },
  { key: "cleaner", label: "დამლაგებელი", href: "/dashboard/cleaner" },
];

interface CabinetSwitcherProps {
  activeKey: string;
  children: React.ReactNode;
  triggerClassName?: string;
  openClassName?: string;
}

export function CabinetSwitcher({
  activeKey,
  children,
  triggerClassName,
  openClassName,
}: CabinetSwitcherProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handle(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open]);

  return (
    <div ref={containerRef} className="relative mx-4">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex w-full items-center gap-3 rounded-2xl border px-3 py-3 text-left transition-colors",
          open
            ? (openClassName ?? "border-[#2563EB] bg-[#EFF6FF]")
            : (triggerClassName ??
                "border-[#EEF1F4] bg-white hover:border-[#CBD5E1]"),
        )}
      >
        {children}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.15 }}
            className="absolute left-0 right-0 top-[calc(100%+8px)] z-40 overflow-hidden rounded-2xl border border-[#E2E8F0] bg-white shadow-[0px_16px_40px_-12px_rgba(15,23,42,0.18)]"
          >
            <div className="border-b border-[#F1F5F9] px-4 py-2.5">
              <p className="text-[10px] font-black uppercase tracking-[0.1em] text-[#94A3B8]">
                სივრცის შეცვლა
              </p>
            </div>
            <ul className="py-2">
              {ALL_ITEMS.map((item) => {
                const isActive = item.key === activeKey;
                return (
                  <li key={item.key}>
                    <Link
                      href={item.href}
                      onClick={() => setOpen(false)}
                      className={cn(
                        "flex items-center gap-2 px-4 py-2.5 text-[13px] font-semibold transition-colors",
                        isActive
                          ? "text-[#2563EB]"
                          : "text-[#0F172A] hover:bg-[#F8FAFC]",
                      )}
                    >
                      <span className="flex-1 truncate">{item.label}</span>
                      {isActive && <Check className="h-4 w-4 text-[#10B981]" />}
                    </Link>
                  </li>
                );
              })}
            </ul>

            <div className="flex items-center gap-2 border-t border-[#F1F5F9] px-4 py-2.5">
              <Settings className="h-3.5 w-3.5 text-[#94A3B8]" />
              <span className="text-[11px] font-bold uppercase tracking-wide text-[#94A3B8]">
                პარამეტრები
              </span>
            </div>

            <div className="px-3 pb-3 pt-1">
              <Link
                href="/dashboard/guest"
                onClick={() => setOpen(false)}
                className="block rounded-xl border border-[#BFDBFE] bg-[#EFF6FF] px-4 py-2.5 text-center"
              >
                <p className="text-[13px] font-bold text-[#2563EB]">
                  სტუმრის რეჟიმი
                </p>
                <p className="mt-0.5 text-[10px] font-medium text-[#64748B]">
                  სერვისების დათვალიერება
                </p>
              </Link>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
