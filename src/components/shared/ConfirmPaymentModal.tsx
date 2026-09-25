"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2, AlertTriangle } from "lucide-react";
import Modal from "@/components/shared/Modal";

interface ConfirmPaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void> | void;
  title: string;
  description?: string;
  priceLabel: string;
  balance?: number | null;
  lockScroll?: boolean;
  /** Validity period shown before payment (pricing rules §6). Omitted → not rendered. */
  validity?: string;
  /** Main conditions of the service, one per line. Omitted/empty → not rendered. */
  conditions?: string[];
}

export default function ConfirmPaymentModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  priceLabel,
  balance,
  lockScroll = true,
  validity,
  conditions,
}: ConfirmPaymentModalProps) {
  const t = useTranslations("DashboardShared");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setError(null);
      setLoading(false);
    }
  }, [isOpen]);

  async function handleConfirm() {
    setLoading(true);
    setError(null);
    try {
      await onConfirm();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("genericRetry"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t("confirmPayment.title")}
      size="sm"
      lockScroll={lockScroll}
    >
      <div className="space-y-5">
        <div>
          <p className="text-[15px] font-black text-[#0F172A]">{title}</p>
          {description && (
            <p className="mt-1 text-[13px] text-[#64748B]">{description}</p>
          )}
        </div>
        <div className="rounded-xl border border-[#EEF1F4] bg-[#FAFBFC] p-4">
          <p className="text-[20px] font-black text-[#0F172A]">{priceLabel}</p>
          {balance != null && (
            <p className="mt-1 text-[12px] font-semibold text-[#64748B]">
              {t("currentBalance")}: {balance.toFixed(2)} ₾
            </p>
          )}
        </div>
        {(validity || (conditions && conditions.length > 0)) && (
          <div className="space-y-2 text-[12px] leading-[18px] text-[#475569]">
            {validity && (
              <p>
                <span className="font-bold text-[#0F172A]">
                  {t("confirmPayment.validity")}:
                </span>{" "}
                {validity}
              </p>
            )}
            {conditions && conditions.length > 0 && (
              <div>
                <p className="font-bold text-[#0F172A]">
                  {t("confirmPayment.conditions")}
                </p>
                <ul className="mt-1 list-disc space-y-1 pl-4">
                  {conditions.map((condition) => (
                    <li key={condition}>{condition}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
        {error && (
          <div className="flex items-start gap-2 rounded-xl bg-[#FEF2F2] p-3 text-[13px] font-medium text-[#DC2626]">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="flex-1 rounded-xl border border-[#E2E8F0] py-3 text-[13px] font-bold text-[#0F172A] hover:bg-[#F8FAFC] disabled:opacity-50"
          >
            {t("cancel")}
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={loading}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#2563EB] py-3 text-[13px] font-bold text-white hover:bg-[#1E40AF] disabled:opacity-50"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              t("confirmPayment.agree")
            )}
          </button>
        </div>
      </div>
    </Modal>
  );
}
