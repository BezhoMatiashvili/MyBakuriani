"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Sparkles, X, Calendar, Check, ChevronDown } from "lucide-react";

type CategoryKey =
  | "all"
  | "cottage"
  | "apartment"
  | "transport"
  | "food"
  | "excursion";

const CATEGORIES: { key: CategoryKey; label: string }[] = [
  { key: "all", label: "ყველა ჩამონათვალი" },
  { key: "cottage", label: "კოტეჯი" },
  { key: "apartment", label: "აპარტამენტი" },
  { key: "transport", label: "ტრანსფერი" },
  { key: "food", label: "კვება" },
  { key: "excursion", label: "ექსკურსია" },
];

export interface NewBookingRequestPayload {
  category: CategoryKey;
  checkIn: string;
  checkOut: string;
  budgetMin?: number;
  budgetMax?: number;
  guestsCount?: number;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (payload: NewBookingRequestPayload) => Promise<void> | void;
  smsCost?: number;
}

export default function NewBookingRequestModal({
  isOpen,
  onClose,
  onSubmit,
  smsCost = 1,
}: Props) {
  const [category, setCategory] = useState<CategoryKey>("all");
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const today = new Date().toISOString().slice(0, 10);
  const [checkIn, setCheckIn] = useState(today);
  const [checkOut, setCheckOut] = useState(today);
  const [guestsCount, setGuestsCount] = useState<number>(2);
  const [budgetMin, setBudgetMin] = useState<string>("");
  const [budgetMax, setBudgetMax] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [isOpen, onClose]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await onSubmit({
        category,
        checkIn,
        checkOut,
        guestsCount,
        budgetMin: budgetMin ? Number(budgetMin) : undefined,
        budgetMax: budgetMax ? Number(budgetMax) : undefined,
      });
      onClose();
    } finally {
      setSubmitting(false);
    }
  }

  const selectedLabel =
    CATEGORIES.find((c) => c.key === category)?.label ?? CATEGORIES[0].label;

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center px-4 py-6 sm:items-center">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/50"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ duration: 0.2 }}
            className="relative z-10 w-full max-w-[520px] overflow-hidden rounded-[24px] bg-white shadow-[0px_24px_60px_-12px_rgba(15,23,42,0.25)]"
          >
            <form onSubmit={handleSubmit}>
              <div className="flex items-start justify-between gap-3 border-b border-[#EEF1F4] px-7 pt-6 pb-5">
                <div>
                  <h2 className="text-[22px] font-black leading-[28px] text-[#0F172A]">
                    ახალი მოთხოვნა
                  </h2>
                  <p className="mt-1 text-[12px] font-medium text-[#64748B]">
                    გააგზავნე მოთხოვნა და მფლობელები დაგიკავშირდებიან.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[#94A3B8] transition-colors hover:bg-[#F1F5F9] hover:text-[#0F172A]"
                  aria-label="close"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="space-y-4 px-7 py-6">
                <div className="relative">
                  <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-[#64748B]">
                    მიზნობრივი კატეგორია
                  </label>
                  <button
                    type="button"
                    onClick={() => setDropdownOpen((v) => !v)}
                    className="flex h-12 w-full items-center justify-between rounded-xl border border-[#E2E8F0] bg-white px-4 text-left text-[13px] font-semibold text-[#0F172A] transition-colors hover:border-[#0F8F60]"
                  >
                    <span>{selectedLabel}</span>
                    <ChevronDown
                      className={`h-4 w-4 text-[#94A3B8] transition-transform ${
                        dropdownOpen ? "rotate-180" : ""
                      }`}
                    />
                  </button>
                  {dropdownOpen && (
                    <motion.ul
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="absolute left-0 right-0 top-[calc(100%+6px)] z-10 overflow-hidden rounded-xl border border-[#E2E8F0] bg-white py-1 shadow-[0px_16px_40px_-12px_rgba(15,23,42,0.18)]"
                    >
                      {CATEGORIES.map((c) => {
                        const active = c.key === category;
                        return (
                          <li key={c.key}>
                            <button
                              type="button"
                              onClick={() => {
                                setCategory(c.key);
                                setDropdownOpen(false);
                              }}
                              className={`flex w-full items-center justify-between px-4 py-2.5 text-[13px] font-semibold transition-colors ${
                                active
                                  ? "text-[#0F8F60]"
                                  : "text-[#0F172A] hover:bg-[#F8FAFC]"
                              }`}
                            >
                              <span>{c.label}</span>
                              {active && (
                                <Check className="h-4 w-4 text-[#10B981]" />
                              )}
                            </button>
                          </li>
                        );
                      })}
                    </motion.ul>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-[#64748B]">
                      ჩამოსვლა
                    </label>
                    <div className="relative">
                      <Calendar className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#94A3B8]" />
                      <input
                        type="date"
                        value={checkIn}
                        onChange={(e) => setCheckIn(e.target.value)}
                        className="h-12 w-full rounded-xl border border-[#E2E8F0] bg-white pl-10 pr-3 text-[13px] font-semibold text-[#0F172A] focus:border-[#0F8F60] focus:outline-none focus:ring-2 focus:ring-[#0F8F60]/15"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-[#64748B]">
                      გასვლა
                    </label>
                    <div className="relative">
                      <Calendar className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#94A3B8]" />
                      <input
                        type="date"
                        value={checkOut}
                        onChange={(e) => setCheckOut(e.target.value)}
                        min={checkIn}
                        className="h-12 w-full rounded-xl border border-[#E2E8F0] bg-white pl-10 pr-3 text-[13px] font-semibold text-[#0F172A] focus:border-[#0F8F60] focus:outline-none focus:ring-2 focus:ring-[#0F8F60]/15"
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-[#64748B]">
                    სტუმრების რაოდენობა
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={20}
                    value={guestsCount}
                    onChange={(e) =>
                      setGuestsCount(Math.max(1, Number(e.target.value) || 1))
                    }
                    className="h-12 w-full rounded-xl border border-[#E2E8F0] bg-white px-4 text-[13px] font-semibold text-[#0F172A] focus:border-[#0F8F60] focus:outline-none focus:ring-2 focus:ring-[#0F8F60]/15"
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-[#64748B]">
                    ბიუჯეტი (₾ / ღამე)
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <input
                      type="number"
                      min={0}
                      placeholder="მინ."
                      value={budgetMin}
                      onChange={(e) => setBudgetMin(e.target.value)}
                      className="h-12 w-full rounded-xl border border-[#E2E8F0] bg-white px-4 text-[13px] font-semibold text-[#0F172A] focus:border-[#0F8F60] focus:outline-none focus:ring-2 focus:ring-[#0F8F60]/15"
                    />
                    <input
                      type="number"
                      min={0}
                      placeholder="მაქს."
                      value={budgetMax}
                      onChange={(e) => setBudgetMax(e.target.value)}
                      className="h-12 w-full rounded-xl border border-[#E2E8F0] bg-white px-4 text-[13px] font-semibold text-[#0F172A] focus:border-[#0F8F60] focus:outline-none focus:ring-2 focus:ring-[#0F8F60]/15"
                    />
                  </div>
                </div>
              </div>

              <div className="px-7 pb-7">
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#0F8F60] to-[#0B7A52] px-5 py-3.5 text-[14px] font-black text-white shadow-[0_10px_20px_-6px_rgba(15,143,96,0.45)] transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Sparkles className="h-4 w-4" />
                  {submitting
                    ? "მიმდინარეობს..."
                    : `მოთხოვნის გაგზავნა (${smsCost} SMS ლიმიტიდან)`}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
