"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";
import Modal from "@/components/shared/Modal";
import NumberField from "@/components/shared/NumberField";
import { formatPrice } from "@/lib/utils/format";

const PRESETS = [20, 50, 100, 200];
const MAX_AMOUNT = 999999;

interface TopUpModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (amount: number) => void;
  loading?: boolean;
}

export default function TopUpModal({
  isOpen,
  onClose,
  onConfirm,
  loading,
}: TopUpModalProps) {
  const t = useTranslations("DashboardShared");
  const [amount, setAmount] = useState("100");

  const numeric = Number(amount);
  const valid =
    Number.isFinite(numeric) && numeric >= 1 && numeric <= MAX_AMOUNT;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t("topUp.title")}>
      <div className="space-y-5">
        <p className="text-sm text-[#64748B]">{t("topUp.subtitle")}</p>

        <div className="grid grid-cols-4 gap-2">
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
            min={1}
            max={MAX_AMOUNT}
            integer
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
            t("topUp.continue", { amount: formatPrice(valid ? numeric : 0) })
          )}
        </button>
      </div>
    </Modal>
  );
}
