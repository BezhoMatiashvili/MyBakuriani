"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2, ShieldCheck } from "lucide-react";
import Modal from "@/components/shared/Modal";
import NumberField from "@/components/shared/NumberField";
import { formatGelAmount } from "@/lib/utils/pricing";
import {
  MAX_CARD_TOPUP_TETRI,
  MIN_CARD_TOPUP_TETRI,
} from "@/lib/payments/keepz/amount";

const PRESETS = [20, 50, 100, 200];
// Same bounds the checkout route and payments_keepz_amount_check enforce (C32).
const MIN_AMOUNT = MIN_CARD_TOPUP_TETRI / 100;
const MAX_AMOUNT = MAX_CARD_TOPUP_TETRI / 100;

interface TopUpModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (amount: number) => void;
  loading?: boolean;
  /** Amount in GEL to open with. */
  initialAmount?: number;
}

export default function TopUpModal({
  isOpen,
  onClose,
  onConfirm,
  loading,
  initialAmount,
}: TopUpModalProps) {
  const t = useTranslations("DashboardShared");
  const tPayments = useTranslations("Payments");
  const [amount, setAmount] = useState("100");

  // A deep link's amount (the support assistant's top-up button, C43): only
  // filled in; the payer still confirms and pays on Keepz.
  useEffect(() => {
    if (isOpen && initialAmount !== undefined) setAmount(String(initialAmount));
  }, [isOpen, initialAmount]);

  const numeric = Number(amount);
  const valid =
    Number.isFinite(numeric) && numeric >= MIN_AMOUNT && numeric <= MAX_AMOUNT;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t("topUp.title")}>
      <div className="space-y-5">
        <p className="text-sm text-[#64748B]">{t("topUp.subtitle")}</p>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {PRESETS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setAmount(String(p))}
              className={`rounded-xl border py-3 text-sm font-bold transition-colors ${
                numeric === p
                  ? "border-[#2563EB] bg-[#EFF6FF] text-[#2563EB]"
                  : "border-[#E2E8F0] text-[#0F172A] hover:bg-[#F8FAFC]"
              }`}
            >
              {p} ₾
            </button>
          ))}
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-[#64748B]">
            {t("topUp.customAmount")}
          </label>
          <NumberField
            value={amount}
            onChange={setAmount}
            min={MIN_AMOUNT}
            max={MAX_AMOUNT}
            decimals={2}
            suffix="₾"
          />
        </div>

        <button
          type="button"
          disabled={!valid || loading}
          onClick={() => onConfirm(numeric)}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#2563EB] px-4 py-3.5 text-sm font-bold text-white transition-colors hover:bg-[#1E40AF] disabled:opacity-50"
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            t("topUp.continue", {
              amount: formatGelAmount(valid ? numeric : 0),
            })
          )}
        </button>
        <p className="flex items-center justify-center gap-1.5 text-[11px] text-[#64748B]">
          <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
          {tPayments("secureNote")}
        </p>
      </div>
    </Modal>
  );
}
