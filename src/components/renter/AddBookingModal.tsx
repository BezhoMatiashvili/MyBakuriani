"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { AnimatePresence, motion } from "framer-motion";
import { X, CalendarDays, Briefcase, ChevronDown } from "lucide-react";

const clientListKeys = ["platform", "booking", "social", "direct"] as const;
type ClientListKey = (typeof clientListKeys)[number];

// Exact DB payload values for manual_bookings.client_list — must stay
// byte-identical to the pre-i18n stored values regardless of UI locale.
const CLIENT_LIST_DB_VALUES: Record<ClientListKey, string> = {
  platform: "MyBakuriani.ge",
  booking: "Booking.com",
  social: "სოციალური მედია",
  direct: "პირდაპირი კავშირი",
};

export interface AddBookingPayload {
  checkIn: string;
  checkOut: string;
  source: string;
  guestName: string;
  status: "booked" | "manual";
  clientList: string;
}

interface AddBookingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit?: (payload: AddBookingPayload) => void;
  initialCheckIn?: string;
  initialCheckOut?: string;
}

export default function AddBookingModal({
  isOpen,
  onClose,
  onSubmit,
  initialCheckIn = "",
  initialCheckOut = "",
}: AddBookingModalProps) {
  const t = useTranslations("RenterDashboard.modals.addBooking");
  const tShared = useTranslations("DashboardShared");

  const [checkIn, setCheckIn] = useState(initialCheckIn);
  const [checkOut, setCheckOut] = useState(initialCheckOut);
  const [source, setSource] = useState("");
  const [guestName, setGuestName] = useState("");
  const [status, setStatus] = useState<"booked" | "manual">("manual");
  const [clientListKey, setClientListKey] = useState<ClientListKey>("platform");

  useEffect(() => {
    setCheckIn(initialCheckIn);
    setCheckOut(initialCheckOut);
  }, [initialCheckIn, initialCheckOut]);

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
            className="relative z-10 w-full max-w-[520px] rounded-[24px] bg-white p-6 shadow-[0px_24px_60px_-12px_rgba(15,23,42,0.25)]"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#DCFCE7] text-[#16A34A]">
                  <Briefcase className="h-4 w-4" strokeWidth={2.3} />
                </span>
                <div>
                  <h2 className="text-[16px] font-black text-[#0F172A]">
                    {t("title")}
                  </h2>
                  <p className="mt-0.5 text-[12px] font-medium text-[#64748B]">
                    {t("subtitle")}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label={tShared("closeAria")}
                className="flex h-8 w-8 items-center justify-center rounded-full text-[#94A3B8] hover:bg-[#F1F5F9]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-3">
              <Field label={tShared("checkIn")}>
                <DateInput
                  value={checkIn}
                  onChange={setCheckIn}
                  placeholder={t("datePlaceholder")}
                />
              </Field>
              <Field label={tShared("checkOut")}>
                <DateInput
                  value={checkOut}
                  onChange={setCheckOut}
                  placeholder={t("datePlaceholder")}
                />
              </Field>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-3">
              <Field label={t("sourceLabel")}>
                <input
                  type="text"
                  value={source}
                  onChange={(e) => setSource(e.target.value)}
                  placeholder={t("sourcePlaceholder")}
                  className="w-full rounded-xl border border-[#E2E8F0] bg-white px-4 py-2.5 text-[13px] font-semibold text-[#0F172A] focus:border-[#2563EB] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/10"
                />
              </Field>
              <Field label={tShared("guest")}>
                <input
                  type="text"
                  value={guestName}
                  onChange={(e) => setGuestName(e.target.value)}
                  placeholder={t("guestPlaceholder")}
                  className="w-full rounded-xl border border-[#E2E8F0] bg-white px-4 py-2.5 text-[13px] font-semibold text-[#0F172A] focus:border-[#2563EB] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/10"
                />
              </Field>
            </div>

            <div className="mt-3">
              <Field label={t("statusLabel")}>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setStatus("manual")}
                    className={`rounded-xl border px-4 py-2.5 text-[12px] font-bold transition-colors ${
                      status === "manual"
                        ? "border-[#F59E0B] bg-[#FEF3C7] text-[#D97706]"
                        : "border-[#E2E8F0] bg-white text-[#64748B]"
                    }`}
                  >
                    {t("manual")}
                  </button>
                  <button
                    type="button"
                    onClick={() => setStatus("booked")}
                    className={`rounded-xl border px-4 py-2.5 text-[12px] font-bold transition-colors ${
                      status === "booked"
                        ? "border-[#EF4444] bg-[#FEE2E2] text-[#DC2626]"
                        : "border-[#E2E8F0] bg-white text-[#64748B]"
                    }`}
                  >
                    {t("booked")}
                  </button>
                </div>
              </Field>
            </div>

            <div className="mt-3">
              <Field label={t("clientList")}>
                <div className="relative">
                  <select
                    value={clientListKey}
                    onChange={(e) =>
                      setClientListKey(e.target.value as ClientListKey)
                    }
                    className="w-full appearance-none rounded-xl border border-[#E2E8F0] bg-white px-4 py-2.5 pr-10 text-[13px] font-semibold text-[#0F172A] focus:border-[#2563EB] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/10"
                  >
                    {clientListKeys.map((key) => (
                      <option key={key} value={key}>
                        {t(`clientLists.${key}`)}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#94A3B8]" />
                </div>
              </Field>
            </div>

            <button
              type="button"
              onClick={() => {
                onSubmit?.({
                  checkIn,
                  checkOut,
                  source,
                  guestName,
                  status,
                  clientList: CLIENT_LIST_DB_VALUES[clientListKey],
                });
                onClose();
              }}
              className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#2563EB] py-3 text-[13px] font-black text-white transition-colors hover:bg-[#1E40AF]"
            >
              {tShared("add")}
            </button>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wide text-[#94A3B8]">
        {label}
      </label>
      {children}
    </div>
  );
}

function DateInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="relative">
      <input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-xl border border-[#E2E8F0] bg-white px-4 py-2.5 pr-10 text-[13px] font-semibold text-[#0F172A] focus:border-[#2563EB] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/10"
      />
      <CalendarDays className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#94A3B8]" />
    </div>
  );
}
