"use client";

import { useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Star, Pencil, User, X } from "lucide-react";

export interface CleanerDetail {
  id: string;
  name: string;
  initials: string;
  shortId: string;
  rating: number;
  available: boolean;
  priceStandard: number;
  priceGeneral: number;
}

interface CleanerDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  cleaner: CleanerDetail | null;
}

export default function CleanerDetailModal({
  isOpen,
  onClose,
  cleaner,
}: CleanerDetailModalProps) {
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = "";
      };
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [isOpen, onClose]);

  return (
    <AnimatePresence>
      {isOpen && cleaner && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/30 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 10 }}
            transition={{ duration: 0.18 }}
            className="relative z-10 w-full max-w-[520px] rounded-[24px] bg-white p-6 shadow-[0px_24px_60px_-12px_rgba(15,23,42,0.25)]"
          >
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full text-[#94A3B8] hover:bg-[#F1F5F9]"
            >
              <X className="h-4 w-4" />
            </button>

            {/* Header row */}
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#2563EB] text-[15px] font-extrabold text-white">
                  {cleaner.initials}
                </div>
                <div>
                  <p className="text-[16px] font-extrabold text-[#0F172A]">
                    {cleaner.name}{" "}
                    <span className="text-[13px] font-semibold text-[#94A3B8]">
                      ({cleaner.shortId})
                    </span>
                  </p>
                  <div className="mt-1 flex items-center gap-0.5">
                    {Array.from({ length: 5 }).map((_, idx) => (
                      <Star
                        key={idx}
                        className="h-3.5 w-3.5"
                        fill={
                          idx < Math.round(cleaner.rating) ? "#F97316" : "none"
                        }
                        stroke={
                          idx < Math.round(cleaner.rating)
                            ? "#F97316"
                            : "#E2E8F0"
                        }
                      />
                    ))}
                  </div>
                </div>
              </div>
              {cleaner.available && (
                <span className="inline-flex items-center rounded-lg bg-[#DCFCE7] px-3 py-1.5 text-[11px] font-bold text-[#16A34A]">
                  თავისუფალია
                </span>
              )}
            </div>

            {/* Pricing */}
            <div className="mt-6 grid grid-cols-2 overflow-hidden rounded-2xl bg-[#F8FAFC]">
              <div className="flex flex-col items-start px-5 py-4">
                <span className="text-[12px] font-semibold text-[#64748B]">
                  სტანდარტული
                </span>
                <span className="mt-1 text-[22px] font-black text-[#0F172A]">
                  {cleaner.priceStandard} ₾
                </span>
              </div>
              <div className="relative flex flex-col items-start px-5 py-4">
                <span className="absolute left-0 top-1/2 h-8 -translate-y-1/2 border-l border-[#E2E8F0]" />
                <span className="text-[12px] font-semibold text-[#64748B]">
                  გენერალური
                </span>
                <span className="mt-1 text-[22px] font-black text-[#0F172A]">
                  {cleaner.priceGeneral} ₾
                </span>
              </div>
            </div>

            {/* Footer actions */}
            <div className="mt-6 flex items-center gap-3">
              <button
                type="button"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[#E2E8F0] bg-white text-[#64748B] transition-colors hover:border-[#2563EB] hover:text-[#2563EB]"
                aria-label="პროფილი"
              >
                <User className="h-4 w-4" />
              </button>
              <button
                type="button"
                className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-[#2563EB] text-[13px] font-bold text-white transition-colors hover:bg-[#1E40AF]"
              >
                <Pencil className="h-4 w-4" strokeWidth={2.4} />
                გამოძახება
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
