"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2, AlertTriangle } from "lucide-react";
import Modal from "@/components/shared/Modal";
import CardPayButton from "@/components/payments/CardPayButton";
import { cardShortfallTetri } from "@/lib/payments/keepz/amount";
import type { PurchaseIntent } from "@/lib/payments/keepz/intent";

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
  /** Price in ₾ — with `balance` and `cardPayment`, enables paying by card. */
  amount?: number;
  /**
   * The purchase to complete after a Keepz card top-up (C32). When the wallet
   * is short, the dialog offers "pay by card" for the missing amount instead
   * of a wallet payment that would fail.
   */
  cardPayment?: { resume: PurchaseIntent; returnPath?: string };
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
  amount,
  cardPayment,
}: ConfirmPaymentModalProps) {
  const t = useTranslations("DashboardShared");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // CardPayButton re-reads the wallet before charging; a different balance
  // lands here so the dialog re-decides between wallet and card.
  const [liveBalance, setLiveBalance] = useState(balance);

  useEffect(() => {
    if (isOpen) {
      setError(null);
      setLoading(false);
      setLiveBalance(balance);
    }
  }, [isOpen, balance]);

  const payByCard =
    !!cardPayment &&
    amount != null &&
    liveBalance != null &&
    cardShortfallTetri(amount, liveBalance) > 0;

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
          {liveBalance != null && (
            <p className="mt-1 text-[12px] font-semibold text-[#64748B]">
              {t("currentBalance")}: {liveBalance.toFixed(2)} ₾
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
        {payByCard && cardPayment && amount != null && liveBalance != null && (
          <CardPayButton
            total={amount}
            balance={liveBalance}
            resume={cardPayment.resume}
            returnPath={cardPayment.returnPath}
            onBalanceChange={setLiveBalance}
          />
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
          {!payByCard && (
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
          )}
        </div>
      </div>
    </Modal>
  );
}
