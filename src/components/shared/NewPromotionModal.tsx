"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Megaphone, X, Zap } from "lucide-react";

interface NewPromotionModalProps {
  isOpen: boolean;
  onClose: () => void;
  balance: number;
  costPerDay?: number;
  durationHours?: number;
  onSubmit: (data: {
    title: string;
    description: string;
  }) => Promise<void> | void;
}

export default function NewPromotionModal({
  isOpen,
  onClose,
  balance,
  costPerDay = 1.5,
  durationHours = 24,
  onSubmit,
}: NewPromotionModalProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
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
    if (!title.trim() || !description.trim()) return;
    setSubmitting(true);
    try {
      await onSubmit({ title: title.trim(), description: description.trim() });
      setTitle("");
      setDescription("");
      onClose();
    } finally {
      setSubmitting(false);
    }
  }

  const canAfford = balance >= costPerDay;

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
            className="relative z-10 w-full max-w-[560px] overflow-hidden rounded-[24px] bg-white shadow-[0px_24px_60px_-12px_rgba(15,23,42,0.25)]"
          >
            <div
              aria-hidden
              className="h-1.5 w-full bg-gradient-to-r from-[#F97316] to-[#EA580C]"
            />

            <form onSubmit={handleSubmit}>
              <div className="flex items-start gap-4 px-7 pt-7">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#FFEDD5] text-[#F97316]">
                  <Megaphone className="h-6 w-6" />
                </div>
                <div className="flex-1">
                  <h2 className="text-[22px] font-black leading-[28px] text-[#0F172A]">
                    ახალი აქცია
                  </h2>
                  <p className="mt-1 text-[12px] font-medium text-[#64748B]">
                    დაამატეთ VIP შეთავაზება დღის სიახლეში
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

              <div className="mt-6 space-y-4 px-7">
                <div>
                  <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-[#64748B]">
                    აქციის სათაური <span className="text-[#EF4444]">*</span>
                  </label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="მაგ: -20% ყველა პიცაზე"
                    className="h-12 w-full rounded-xl border border-[#E2E8F0] bg-white px-4 text-[13px] font-semibold text-[#0F172A] placeholder:text-[#94A3B8] focus:border-[#F97316] focus:outline-none focus:ring-2 focus:ring-[#F97316]/15"
                    required
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-[#64748B]">
                    მოკლე აღწერა <span className="text-[#EF4444]">*</span>
                  </label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="მაგ: მოქმედებს მხოლოდ ადგილზე მიტანაზე, 18:00-მდე..."
                    rows={3}
                    className="w-full resize-none rounded-xl border border-[#E2E8F0] bg-white px-4 py-3 text-[13px] font-medium text-[#0F172A] placeholder:text-[#94A3B8] focus:border-[#F97316] focus:outline-none focus:ring-2 focus:ring-[#F97316]/15"
                    required
                  />
                </div>
              </div>

              <div className="mx-7 mt-5 flex items-center justify-between rounded-2xl border border-[#EEF1F4] bg-[#F8FAFC] px-5 py-4">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wide text-[#94A3B8]">
                    VIP ხანგრძლივობა ({durationHours} სთ)
                  </p>
                  <p className="mt-1 text-[20px] font-black text-[#0F172A]">
                    {costPerDay.toFixed(2)}
                  </p>
                </div>
                <span aria-hidden className="mx-4 h-10 w-px bg-[#E2E8F0]" />
                <div className="text-right">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-[#94A3B8]">
                    თქვენი ბალანსი
                  </p>
                  <p
                    className={`mt-1 text-[20px] font-black ${
                      canAfford ? "text-[#10B981]" : "text-[#EF4444]"
                    }`}
                  >
                    {balance.toFixed(2)}
                  </p>
                </div>
              </div>

              <div className="px-7 pb-7 pt-5">
                <button
                  type="submit"
                  disabled={
                    !canAfford ||
                    submitting ||
                    !title.trim() ||
                    !description.trim()
                  }
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#F97316] to-[#EA580C] px-5 py-3.5 text-[14px] font-black text-white shadow-[0_10px_20px_-6px_rgba(249,115,22,0.45)] transition-transform hover:-translate-y-0.5 disabled:translate-y-0 disabled:cursor-not-allowed disabled:from-[#CBD5E1] disabled:to-[#94A3B8] disabled:shadow-none"
                >
                  <Zap className="h-4 w-4" fill="currentColor" />
                  {submitting
                    ? "მიმდინარეობს..."
                    : canAfford
                      ? "ბალანსიდან გადახდა"
                      : "არასაკმარისი ბალანსი"}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
