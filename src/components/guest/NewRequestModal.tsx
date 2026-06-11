"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { AnimatePresence, motion } from "framer-motion";
import { Send, X, MapPin, ChevronDown, Calendar, Plus } from "lucide-react";
import { useActiveZones } from "@/lib/zones/client";

export interface NewRequestPayload {
  zone: string | "all";
  checkIn: string;
  checkOut: string;
  guestsCount?: number;
  budgetMin?: number;
  budgetMax?: number;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (payload: NewRequestPayload) => Promise<void> | void;
}

export default function NewRequestModal({ isOpen, onClose, onSubmit }: Props) {
  const t = useTranslations("GuestDashboard.newRequestModal");
  const tGuest = useTranslations("GuestDashboard");
  const tShared = useTranslations("DashboardShared");

  const today = new Date().toISOString().slice(0, 10);
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);

  const { zones } = useActiveZones();
  const ZONE_OPTIONS: { value: NewRequestPayload["zone"]; label: string }[] =
    useMemo(
      () => [
        { value: "all", label: t("allZones") },
        ...zones.map((z) => ({ value: z.name_ka, label: z.name_ka })),
      ],
      [zones, t],
    );

  const [zone, setZone] = useState<NewRequestPayload["zone"]>("all");
  const [zoneOpen, setZoneOpen] = useState(false);
  const [checkIn, setCheckIn] = useState(today);
  const [checkOut, setCheckOut] = useState(tomorrow);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [guestsCount, setGuestsCount] = useState<string>("");
  const [budgetMin, setBudgetMin] = useState<string>("");
  const [budgetMax, setBudgetMax] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(false);

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

  useEffect(() => {
    if (isOpen) return;
    setZoneOpen(false);
    setAdvancedOpen(false);
    setSubmitting(false);
    setSubmitError(false);
  }, [isOpen]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setSubmitError(false);
    try {
      await onSubmit({
        zone,
        checkIn,
        checkOut,
        guestsCount: guestsCount ? Number(guestsCount) : undefined,
        budgetMin: budgetMin ? Number(budgetMin) : undefined,
        budgetMax: budgetMax ? Number(budgetMax) : undefined,
      });
      onClose();
    } catch {
      // Keep the modal open so the guest can retry — closing here would look
      // like success even though the request was never created.
      setSubmitError(true);
    } finally {
      setSubmitting(false);
    }
  }

  const selectedZoneLabel =
    ZONE_OPTIONS.find((o) => o.value === zone)?.label ?? ZONE_OPTIONS[0].label;

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
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
            className="relative z-10 w-full max-w-[calc(100vw-2rem)] max-h-[92vh] overflow-y-auto overscroll-contain rounded-t-2xl bg-white shadow-[0px_16px_40px_-12px_rgba(0,0,0,0.15)] sm:max-w-md sm:rounded-2xl"
          >
            <form onSubmit={handleSubmit}>
              <div className="flex items-start justify-between gap-4 px-6 pb-2 pt-6">
                <h2 className="text-[20px] font-black leading-[26px] text-[#0F172A]">
                  {tGuest("newRequest")}
                </h2>
                <button
                  type="button"
                  onClick={onClose}
                  className="flex size-8 shrink-0 items-center justify-center rounded-full text-[#94A3B8] hover:bg-[#F1F5F9]"
                  aria-label={tShared("closeAria")}
                >
                  <X className="size-4" />
                </button>
              </div>
              <p className="px-6 pb-5 text-[13px] font-medium text-[#64748B]">
                {t("subtitle")}
              </p>

              <div className="space-y-4 px-6 pb-6">
                <div>
                  <label className="mb-1.5 block text-[12px] font-bold text-[#0F172A]">
                    {t("locationLabel")}
                  </label>
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setZoneOpen((v) => !v)}
                      className="flex h-12 w-full items-center justify-between rounded-xl border border-[#E2E8F0] bg-white px-4 text-left text-[13px] font-semibold text-[#0F172A] hover:border-[#0F8F60] focus:border-[#0F8F60] focus:outline-none"
                    >
                      <span className="flex items-center gap-2">
                        <MapPin className="h-4 w-4 text-[#0F8F60]" />
                        {selectedZoneLabel}
                      </span>
                      <ChevronDown
                        className={`h-4 w-4 text-[#94A3B8] transition-transform ${
                          zoneOpen ? "rotate-180" : ""
                        }`}
                      />
                    </button>
                    <AnimatePresence>
                      {zoneOpen && (
                        <motion.div
                          initial={{ opacity: 0, y: -4 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -4 }}
                          transition={{ duration: 0.15 }}
                          className="absolute left-0 right-0 top-[calc(100%+4px)] z-20 overflow-hidden rounded-xl border border-[#E2E8F0] bg-white shadow-[0px_8px_24px_-8px_rgba(0,0,0,0.15)]"
                        >
                          {ZONE_OPTIONS.map((opt) => (
                            <button
                              key={opt.value}
                              type="button"
                              onClick={() => {
                                setZone(opt.value);
                                setZoneOpen(false);
                              }}
                              className={`flex w-full items-center justify-between px-4 py-3 text-left text-[13px] font-semibold transition-colors hover:bg-[#F8FAFC] ${
                                zone === opt.value
                                  ? "text-[#0F8F60]"
                                  : "text-[#0F172A]"
                              }`}
                            >
                              <span>{opt.label}</span>
                              {zone === opt.value && (
                                <span className="text-[#0F8F60]">✓</span>
                              )}
                            </button>
                          ))}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1.5 block text-[12px] font-bold text-[#0F172A]">
                      {t("checkIn")}
                    </label>
                    <div className="relative">
                      <Calendar className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#94A3B8]" />
                      <input
                        type="date"
                        value={checkIn}
                        min={today}
                        onChange={(e) => {
                          setCheckIn(e.target.value);
                          if (e.target.value >= checkOut) {
                            const next = new Date(
                              new Date(e.target.value).getTime() + 86400000,
                            )
                              .toISOString()
                              .slice(0, 10);
                            setCheckOut(next);
                          }
                        }}
                        className="h-12 w-full rounded-xl border border-[#E2E8F0] bg-white pl-10 pr-3 text-[13px] font-semibold text-[#0F172A] focus:border-[#0F8F60] focus:outline-none"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="mb-1.5 block text-[12px] font-bold text-[#0F172A]">
                      {t("checkOut")}
                    </label>
                    <div className="relative">
                      <Calendar className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#94A3B8]" />
                      <input
                        type="date"
                        value={checkOut}
                        min={checkIn || today}
                        onChange={(e) => setCheckOut(e.target.value)}
                        className="h-12 w-full rounded-xl border border-[#E2E8F0] bg-white pl-10 pr-3 text-[13px] font-semibold text-[#0F172A] focus:border-[#0F8F60] focus:outline-none"
                      />
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setAdvancedOpen((v) => !v)}
                  className="flex items-center gap-1.5 text-[12px] font-bold text-[#0F8F60] hover:underline"
                >
                  <Plus
                    className={`h-3.5 w-3.5 transition-transform ${
                      advancedOpen ? "rotate-45" : ""
                    }`}
                  />
                  {advancedOpen ? t("hideAdvanced") : t("showAdvanced")}
                </button>

                <AnimatePresence>
                  {advancedOpen && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <div className="space-y-3 pt-1">
                        <div>
                          <label className="mb-1.5 block text-[12px] font-bold text-[#0F172A]">
                            {t("guestsCount")}
                          </label>
                          <input
                            type="number"
                            min={1}
                            placeholder={t("guestsPlaceholder")}
                            value={guestsCount}
                            onChange={(e) => setGuestsCount(e.target.value)}
                            className="h-11 w-full rounded-xl border border-[#E2E8F0] bg-white px-3 text-[13px] font-semibold text-[#0F172A] placeholder:text-[#94A3B8] focus:border-[#0F8F60] focus:outline-none"
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="mb-1.5 block text-[12px] font-bold text-[#0F172A]">
                              {t("budgetMin")}
                            </label>
                            <input
                              type="number"
                              min={0}
                              placeholder="100"
                              value={budgetMin}
                              onChange={(e) => setBudgetMin(e.target.value)}
                              className="h-11 w-full rounded-xl border border-[#E2E8F0] bg-white px-3 text-[13px] font-semibold text-[#0F172A] placeholder:text-[#94A3B8] focus:border-[#0F8F60] focus:outline-none"
                            />
                          </div>
                          <div>
                            <label className="mb-1.5 block text-[12px] font-bold text-[#0F172A]">
                              {t("budgetMax")}
                            </label>
                            <input
                              type="number"
                              min={0}
                              placeholder="200"
                              value={budgetMax}
                              onChange={(e) => setBudgetMax(e.target.value)}
                              className="h-11 w-full rounded-xl border border-[#E2E8F0] bg-white px-3 text-[13px] font-semibold text-[#0F172A] placeholder:text-[#94A3B8] focus:border-[#0F8F60] focus:outline-none"
                            />
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {submitError && (
                  <p className="rounded-xl border border-[#FECACA] bg-[#FEF2F2] px-4 py-3 text-[12px] font-bold text-[#DC2626]">
                    {t("submitError")}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={submitting || !checkIn || !checkOut}
                  className="mt-2 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#2563EB] to-[#1D4ED8] text-[13px] font-black text-white shadow-[0px_8px_20px_-6px_rgba(37,99,235,0.45)] transition-transform hover:-translate-y-0.5 disabled:opacity-60 disabled:hover:translate-y-0"
                >
                  <Send className="h-4 w-4" />
                  {submitting ? tShared("sending") : t("submit")}
                  {!submitting && <span className="ml-0.5">✈️</span>}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
