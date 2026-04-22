"use client";

import { useTranslations } from "next-intl";
import { CreditCard, AlertCircle, CheckCircle2 } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { useEffect } from "react";

export type PaymentStatus = "pending" | "paid";

interface PaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  status: PaymentStatus;
  amount: number;
  propertyTitle: string;
  dueDate: string;
}

export default function PaymentModal({
  isOpen,
  onClose,
  status,
  amount,
  propertyTitle,
  dueDate,
}: PaymentModalProps) {
  const t = useTranslations("PaymentModal");

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

  const isPending = status === "pending";

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/30 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ duration: 0.2 }}
            className="relative z-10 w-full max-w-md overflow-hidden rounded-t-2xl bg-white shadow-[0px_16px_40px_-12px_rgba(0,0,0,0.15)] sm:rounded-2xl"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 pt-6">
              <div className="flex items-center gap-2.5">
                <span
                  className={`flex h-9 w-9 items-center justify-center rounded-xl ${
                    isPending
                      ? "bg-[#FEE2E2] text-[#DC2626]"
                      : "bg-[#DBEAFE] text-[#2563EB]"
                  }`}
                >
                  <CreditCard className="h-[18px] w-[18px]" />
                </span>
                <h2 className="text-[17px] font-extrabold text-[#0F172A]">
                  {t("title")}
                </h2>
              </div>
              <button
                onClick={onClose}
                className="flex size-8 items-center justify-center rounded-full text-[#94A3B8] hover:bg-[#F1F5F9]"
                aria-label="Close"
              >
                <X className="size-4" />
              </button>
            </div>

            {/* Info card */}
            <div className="mx-6 mt-6 rounded-2xl border border-[#EEF1F4] bg-[#FAFBFC]">
              <Row label={t("feeAmount")}>
                <span className="text-[20px] font-black text-[#0F172A]">
                  {amount.toFixed(2)}{" "}
                  <span className="text-sm font-bold text-[#64748B]">
                    {t("perMonth")}
                  </span>
                </span>
              </Row>
              <Row label={t("object")}>
                <span className="truncate text-right text-sm font-extrabold text-[#0F172A]">
                  {propertyTitle}
                </span>
              </Row>
              <Row label={t("status")}>
                {isPending ? (
                  <span className="inline-flex items-center gap-1.5 rounded-lg border border-[#FCA5A5] bg-[#FEF2F2] px-2.5 py-1 text-xs font-bold text-[#DC2626]">
                    <AlertCircle className="h-3.5 w-3.5" />
                    {t("badgeDue")}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 rounded-lg border border-[#6EE7B7] bg-[#ECFDF5] px-2.5 py-1 text-xs font-bold text-[#059669]">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    {t("badgePaid")}
                  </span>
                )}
              </Row>
              <Row label={isPending ? t("dueExpires") : t("paidUntil")} last>
                <span
                  className={`text-sm font-extrabold ${
                    isPending ? "text-[#DC2626]" : "text-[#0F172A]"
                  }`}
                >
                  {dueDate}
                </span>
              </Row>
            </div>

            {/* Explanation */}
            <p className="mx-6 mt-5 text-[13px] leading-[20px] text-[#64748B]">
              {isPending ? t("explanationPending") : t("explanationPaid")}
            </p>

            {/* Footer */}
            {isPending && (
              <div className="px-6 pb-6 pt-6">
                <button
                  type="button"
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#2563EB] px-4 py-3.5 text-sm font-bold text-white shadow-[0px_1px_2px_rgba(0,0,0,0.05)] transition-colors hover:bg-[#1E40AF]"
                >
                  <CreditCard className="h-4 w-4" />
                  {t("payButton")}
                </button>
              </div>
            )}
            {!isPending && <div className="pb-6" />}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

function Row({
  label,
  children,
  last,
}: {
  label: string;
  children: React.ReactNode;
  last?: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between gap-4 px-5 py-4 ${
        last ? "" : "border-b border-[#EEF1F4]"
      }`}
    >
      <span className="text-sm font-semibold text-[#64748B]">{label}</span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
