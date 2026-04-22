"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X, Send, CalendarDays, Clock } from "lucide-react";

interface PropertyOption {
  id: string;
  title: string;
}

interface RentOutModalProps {
  isOpen: boolean;
  onClose: () => void;
  properties?: PropertyOption[];
  onSubmit?: (payload: {
    propertyId: string;
    date: string;
    time: string;
    durationDays: number;
  }) => void;
}

const DEFAULT_PROPERTIES: PropertyOption[] = [
  { id: "pr-8842", title: "VIP აპარტამენტი კრისტალში" },
];

export default function RentOutModal({
  isOpen,
  onClose,
  properties = DEFAULT_PROPERTIES,
  onSubmit,
}: RentOutModalProps) {
  const [propertyId, setPropertyId] = useState(properties[0]?.id ?? "");
  const [date, setDate] = useState("2026-03-10");
  const [time, setTime] = useState("12:00");
  const [durationDays, setDurationDays] = useState(3);

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
      {isOpen && (
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
            className="relative z-10 w-full max-w-[460px] rounded-[24px] bg-white p-6 shadow-[0px_24px_60px_-12px_rgba(15,23,42,0.25)]"
          >
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-[17px] font-black text-[#0F172A]">
                  დაქირავების გაცემა
                </h2>
                <p className="mt-1 text-[12px] font-medium text-[#64748B]">
                  შეავსეთ დეტალები და გააგზავნეთ ბმა.
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="flex h-8 w-8 items-center justify-center rounded-full text-[#94A3B8] hover:bg-[#F1F5F9]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-5 space-y-4">
              <div>
                <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-[#94A3B8]">
                  აირჩიეთ ობიექტი
                </label>
                <select
                  value={propertyId}
                  onChange={(e) => setPropertyId(e.target.value)}
                  className="w-full rounded-xl border border-[#E2E8F0] bg-white px-4 py-3 text-[13px] font-semibold text-[#0F172A] focus:border-[#2563EB] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/10"
                >
                  {properties.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.title}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-[#94A3B8]">
                    თარიღი
                  </label>
                  <div className="relative">
                    <input
                      type="date"
                      value={date}
                      onChange={(e) => setDate(e.target.value)}
                      className="w-full rounded-xl border border-[#E2E8F0] bg-white px-4 py-3 pr-10 text-[13px] font-semibold text-[#0F172A] focus:border-[#2563EB] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/10"
                    />
                    <CalendarDays className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#94A3B8]" />
                  </div>
                </div>
                <div>
                  <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-[#94A3B8]">
                    დრო
                  </label>
                  <div className="relative">
                    <input
                      type="time"
                      value={time}
                      onChange={(e) => setTime(e.target.value)}
                      className="w-full rounded-xl border border-[#E2E8F0] bg-white px-4 py-3 pr-10 text-[13px] font-semibold text-[#0F172A] focus:border-[#2563EB] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/10"
                    />
                    <Clock className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#94A3B8]" />
                  </div>
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-[#94A3B8]">
                  ხანგრძლივობა (დღე)
                </label>
                <div className="flex items-center rounded-xl border border-[#E2E8F0] bg-white px-4 py-3">
                  <button
                    type="button"
                    onClick={() => setDurationDays((v) => Math.max(1, v - 1))}
                    className="h-7 w-7 rounded-full border border-[#E2E8F0] text-[#64748B] hover:border-[#2563EB] hover:text-[#2563EB]"
                  >
                    −
                  </button>
                  <span className="flex-1 text-center text-[15px] font-black text-[#0F172A]">
                    {durationDays}
                  </span>
                  <button
                    type="button"
                    onClick={() => setDurationDays((v) => v + 1)}
                    className="h-7 w-7 rounded-full border border-[#E2E8F0] text-[#64748B] hover:border-[#2563EB] hover:text-[#2563EB]"
                  >
                    +
                  </button>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  onSubmit?.({ propertyId, date, time, durationDays });
                  onClose();
                }}
                className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#2563EB] py-3.5 text-[14px] font-black text-white transition-colors hover:bg-[#1E40AF]"
              >
                <Send className="h-4 w-4" />
                გაგზავნა
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
