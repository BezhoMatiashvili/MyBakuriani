"use client";

import { useTranslations } from "next-intl";
import { AnimatePresence, motion } from "framer-motion";
import { Info, Send, ChevronDown, X } from "lucide-react";
import { useEffect } from "react";

export interface SmartMatchRequestItem {
  id: string;
  guestName: string;
  initials: string;
  postedAgo: string;
  matchPercent: number;
  zone: string;
  dates: string;
  guests: string;
  clientBudget: number;
  belowOwnerPrice?: number;
}

interface SmartMatchRequestsModalProps {
  isOpen: boolean;
  onClose: () => void;
  requests: SmartMatchRequestItem[];
  ownerProperties: Array<{ id: string; title: string; price: number }>;
}

export default function SmartMatchRequestsModal({
  isOpen,
  onClose,
  requests,
  ownerProperties,
}: SmartMatchRequestsModalProps) {
  const t = useTranslations("SmartMatchModal");

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
            className="relative z-10 flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-[0px_16px_40px_-12px_rgba(0,0,0,0.15)] sm:rounded-2xl"
          >
            {/* Header */}
            <div className="flex items-start justify-between gap-4 border-b border-[#EEF1F4] px-8 py-6">
              <div>
                <h2 className="text-[22px] font-black text-[#0F172A]">
                  {t("title")}
                </h2>
                <p className="mt-0.5 text-sm font-medium text-[#64748B]">
                  {t("subtitle")}
                </p>
              </div>
              <button
                onClick={onClose}
                className="flex size-9 shrink-0 items-center justify-center rounded-full border border-[#E2E8F0] text-[#94A3B8] hover:bg-[#F1F5F9]"
                aria-label="Close"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto px-8 py-6">
              {/* Info banner */}
              <div className="flex items-start gap-2.5 rounded-xl border border-[#BFDBFE] bg-[#EFF6FF] px-4 py-3">
                <Info className="mt-0.5 h-4 w-4 shrink-0 text-[#2563EB]" />
                <p className="text-[13px] font-medium text-[#1E40AF]">
                  {t("banner")}
                </p>
              </div>

              {/* Request cards */}
              {requests.map((req) => (
                <RequestCard
                  key={req.id}
                  request={req}
                  ownerProperties={ownerProperties}
                />
              ))}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

function RequestCard({
  request,
  ownerProperties,
}: {
  request: SmartMatchRequestItem;
  ownerProperties: Array<{ id: string; title: string; price: number }>;
}) {
  const t = useTranslations("SmartMatchModal");
  const isHighMatch = request.matchPercent >= 90;
  const borderColor = isHighMatch ? "border-[#BBF7D0]" : "border-[#FED7AA]";

  return (
    <div
      className={`rounded-2xl border ${borderColor} bg-white p-5 shadow-[0px_4px_12px_rgba(0,0,0,0.02)]`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#F1F5F9] text-sm font-black text-[#0F172A]">
            {request.initials}
          </div>
          <div>
            <h3 className="text-sm font-extrabold text-[#0F172A]">
              {t("seekingApartment", { name: request.guestName })}
            </h3>
            <p className="mt-0.5 text-[11px] font-medium text-[#94A3B8]">
              {t("requestIdPrefix")} {request.id} • {request.postedAgo}
            </p>
          </div>
        </div>
        <div
          className={`flex h-14 w-[92px] shrink-0 flex-col items-center justify-center rounded-full text-white ${
            isHighMatch ? "bg-[#10B981]" : "bg-[#F97316]"
          }`}
        >
          <span className="text-[9px] font-bold uppercase tracking-wide">
            {t("matchLabel")}
          </span>
          <span className="text-base font-black leading-none">
            {request.matchPercent}%
          </span>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-4 rounded-xl bg-[#FAFBFC] p-4 sm:grid-cols-4">
        <InfoCell label={t("zone")} value={request.zone} />
        <InfoCell label={t("dates")} value={request.dates} />
        <InfoCell label={t("guest")} value={request.guests} />
        <InfoCell
          label={isHighMatch ? t("maxBudget") : t("clientBudget")}
          value={
            <span className={isHighMatch ? "text-[#10B981]" : "text-[#0F172A]"}>
              {request.clientBudget} ₾
            </span>
          }
          hint={
            request.belowOwnerPrice
              ? t("belowYourPrice", {
                  price: `${request.belowOwnerPrice}₾`,
                })
              : undefined
          }
        />
      </div>

      <div className="mt-4 flex flex-col items-stretch gap-2 sm:flex-row">
        <div className="relative flex-1">
          <select
            defaultValue=""
            className="h-11 w-full appearance-none rounded-xl border border-[#E2E8F0] bg-white pl-4 pr-10 text-[13px] font-semibold text-[#0F172A] focus:border-[#2563EB] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/10"
          >
            <option value="" disabled>
              {t("offerPropertyLabel")}
            </option>
            {ownerProperties.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title} ({p.price}₾)
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#94A3B8]" />
        </div>
        <button
          type="button"
          className="h-11 rounded-xl border border-[#E2E8F0] px-5 text-[13px] font-bold text-[#64748B] transition-colors hover:bg-[#F8FAFC]"
        >
          {t("skipButton")}
        </button>
        <button
          type="button"
          className="flex h-11 items-center justify-center gap-2 rounded-xl bg-[#0F172A] px-5 text-[13px] font-bold text-white transition-colors hover:bg-[#1E293B]"
        >
          <Send className="h-3.5 w-3.5" />
          {t("sendButton")}
        </button>
      </div>
    </div>
  );
}

function InfoCell({
  label,
  value,
  hint,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
}) {
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-wide text-[#94A3B8]">
        {label}
      </p>
      <p className="mt-1 text-sm font-extrabold text-[#0F172A]">{value}</p>
      {hint && (
        <p className="mt-0.5 text-[10px] font-medium text-[#DC2626]">
          ↓ {hint}
        </p>
      )}
    </div>
  );
}
