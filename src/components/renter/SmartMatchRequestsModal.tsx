"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { AnimatePresence, motion } from "framer-motion";
import { Info, Send, ChevronDown, X } from "lucide-react";
import NumberField from "@/components/shared/NumberField";

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
  capacityShort?: boolean;
  /** The renter already sent an offer for this request. */
  responded: boolean;
}

export interface OwnerProperty {
  id: string;
  title: string;
  price: number;
}

interface SmartMatchRequestsModalProps {
  isOpen: boolean;
  onClose: () => void;
  requests: SmartMatchRequestItem[];
  ownerProperties: OwnerProperty[];
  // Resolves true when the offer was actually saved; false on failure.
  onSubmitOffer: (params: {
    requestId: string;
    propertyId: string;
    offeredPrice: number;
  }) => Promise<boolean> | boolean;
}

export default function SmartMatchRequestsModal({
  isOpen,
  onClose,
  requests,
  ownerProperties,
  onSubmitOffer,
}: SmartMatchRequestsModalProps) {
  const t = useTranslations("SmartMatchModal");
  const tShared = useTranslations("DashboardShared");

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
            <div className="flex items-start justify-between gap-4 border-b border-[#EEF1F4] px-4 py-6 sm:px-8">
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
                aria-label={tShared("closeAria")}
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto px-4 pt-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] sm:px-8 sm:py-6">
              {/* Info banner */}
              <div className="flex items-start gap-2.5 rounded-xl border border-[#BFDBFE] bg-[#EFF6FF] px-4 py-3">
                <Info className="mt-0.5 h-4 w-4 shrink-0 text-[#2563EB]" />
                <p className="text-[13px] font-medium text-[#1E40AF]">
                  {t("banner")}
                </p>
              </div>

              {/* Request cards */}
              {requests.length === 0 ? (
                <div className="rounded-xl border border-dashed border-[#E2E8F0] bg-[#FAFBFC] py-12 text-center">
                  <p className="text-[13px] font-bold text-[#64748B]">
                    {t("emptyRequests")}
                  </p>
                </div>
              ) : (
                requests.map((req) => (
                  <RequestCard
                    key={req.id}
                    request={req}
                    ownerProperties={ownerProperties}
                    onSubmitOffer={onSubmitOffer}
                  />
                ))
              )}
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
  onSubmitOffer,
}: {
  request: SmartMatchRequestItem;
  ownerProperties: OwnerProperty[];
  onSubmitOffer: SmartMatchRequestsModalProps["onSubmitOffer"];
}) {
  const t = useTranslations("SmartMatchModal");
  const isHighMatch = request.matchPercent >= 90;

  const [selectedPropertyId, setSelectedPropertyId] = useState<string>(
    ownerProperties[0]?.id ?? "",
  );
  const [customPrice, setCustomPrice] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  // The prop persists across reloads/realtime; local state gives instant
  // feedback right after a successful send.
  const isSubmitted = request.responded || submitted;
  const borderColor = isSubmitted
    ? "border-[#BBF7D0]"
    : isHighMatch
      ? "border-[#BBF7D0]"
      : "border-[#FED7AA]";

  const selectedProperty = ownerProperties.find(
    (p) => p.id === selectedPropertyId,
  );

  // Reset custom price when property changes
  useEffect(() => {
    setCustomPrice("");
  }, [selectedPropertyId]);

  async function handleSubmit() {
    if (!selectedProperty || submitting) return;
    setSubmitting(true);
    try {
      const finalPrice = customPrice
        ? Number(customPrice)
        : selectedProperty.price;
      const ok = await onSubmitOffer({
        requestId: request.id,
        propertyId: selectedProperty.id,
        offeredPrice: finalPrice,
      });
      if (ok) setSubmitted(true);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className={`rounded-2xl border ${borderColor} bg-white p-5 shadow-[0px_4px_12px_rgba(0,0,0,0.02)]`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#F1F5F9] text-sm font-black text-[#0F172A]">
            {request.initials}
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-extrabold text-[#0F172A]">
              {t("seekingApartment", { name: request.guestName })}
            </h3>
            <p className="mt-0.5 text-[11px] font-medium text-[#94A3B8]">
              {t("requestIdPrefix")} {request.id} • {request.postedAgo}
            </p>
          </div>
        </div>
        <div
          className={`flex h-14 w-[76px] shrink-0 flex-col items-center justify-center rounded-full text-white sm:w-[92px] ${
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
        <InfoCell
          label={t("guest")}
          value={request.guests}
          hint={request.capacityShort ? t("capacityShort") : undefined}
        />
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

      {isSubmitted ? (
        <div className="mt-4 rounded-xl border border-[#BBF7D0] bg-[#F0FDF4] p-4 text-center">
          <p className="text-[14px] font-extrabold text-[#16A34A]">
            {t("offerSent")}
          </p>
          <p className="mt-1 text-[12px] text-[#64748B]">
            {t("offerSentHint")}
          </p>
        </div>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSubmit();
          }}
          noValidate
        >
          {/* Custom price (always visible) */}
          {selectedProperty && (
            <div className="mt-4">
              <label className="mb-1.5 block text-[11px] font-bold text-[#64748B]">
                {t("yourPriceLabel")}
              </label>
              <div className="flex items-center gap-2">
                <NumberField
                  value={customPrice}
                  onChange={setCustomPrice}
                  min={1}
                  max={99999}
                  decimals={2}
                  suffix="₾"
                  placeholder={String(selectedProperty.price)}
                  className="w-32"
                />
                <span className="text-[12px] font-medium text-[#94A3B8]">
                  {t("perNight")}
                </span>
              </div>
            </div>
          )}

          {/* Property picker + send */}
          <div className="mt-4">
            <p className="mb-1.5 text-[11px] font-bold text-[#64748B]">
              {t("pickProperty")}
            </p>
            <div className="flex flex-col items-stretch gap-2 sm:flex-row">
              <div className="relative flex-1">
                <select
                  value={selectedPropertyId}
                  onChange={(e) => setSelectedPropertyId(e.target.value)}
                  className="h-11 w-full appearance-none rounded-xl border border-[#E2E8F0] bg-white pl-4 pr-10 text-[13px] font-semibold text-[#0F172A] focus:border-[#2563EB] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/10"
                >
                  {ownerProperties.length === 0 && (
                    <option value="">{t("noPropertyOption")}</option>
                  )}
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
                className="h-11 rounded-xl border border-[#E2E8F0] px-4 text-[12px] font-bold text-[#64748B] transition-colors hover:bg-[#F8FAFC]"
              >
                {t("skipButton")}
              </button>
              <button
                type="submit"
                disabled={!selectedProperty || submitting}
                className={`flex h-11 items-center justify-center gap-2 rounded-xl px-5 text-[13px] font-bold text-white transition-colors disabled:opacity-50 ${
                  isHighMatch
                    ? "bg-[#0F8F60] hover:bg-[#0B7A52]"
                    : "bg-[#F97316] hover:bg-[#EA680C]"
                }`}
              >
                <Send className="h-3.5 w-3.5" />
                {submitting ? t("sending") : t("sendOffer")}
              </button>
            </div>
          </div>
        </form>
      )}
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
