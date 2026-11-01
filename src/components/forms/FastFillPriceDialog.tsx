"use client";

import { useEffect, useId, useState } from "react";
import { createPortal } from "react-dom";
import { Zap } from "lucide-react";
import { useTranslations } from "next-intl";
import Modal from "@/components/shared/Modal";
import NumberField from "@/components/shared/NumberField";

const MAX_PRICE = 100000;

interface FastFillPriceDialogProps {
  isOpen: boolean;
  onClose: () => void;
  /** The step's price when the dialog opens ("" before the owner gave one). */
  initialPrice: string;
  /** Days with their own price that filling will reset to the new price. */
  replacedDays: number;
  onApply: (price: number) => void;
}

/**
 * "სწრაფი შევსება": asks for one nightly price for the whole calendar. The
 * rental form makes it the listing's price (price_per_night) and drops the
 * per-day prices, so every day shows it.
 *
 * Portalled to <body>: the wizard step sits inside a <form> (Enter would move
 * the wizard on) and inside a transformed motion.div, which would place this
 * fixed overlay against itself during the step's entry animation — exactly
 * when the dialog opens on its own.
 */
export default function FastFillPriceDialog({
  isOpen,
  onClose,
  initialPrice,
  replacedDays,
  onApply,
}: FastFillPriceDialogProps) {
  const t = useTranslations("AvailabilityWizard");
  const inputId = useId();
  const [draft, setDraft] = useState(initialPrice);

  // Every opening starts from the step's current price and puts the cursor in
  // the field (Modal focuses its close button first). initialPrice cannot
  // change while the dialog is open: only applying (which closes it) sets it.
  useEffect(() => {
    if (!isOpen) return;
    setDraft(initialPrice);
    const timer = window.setTimeout(
      () => document.getElementById(inputId)?.focus(),
      50,
    );
    return () => window.clearTimeout(timer);
  }, [isOpen, initialPrice, inputId]);

  const price = Number(draft);
  const valid =
    draft.trim() !== "" &&
    Number.isInteger(price) &&
    price >= 1 &&
    price <= MAX_PRICE;

  function apply() {
    if (valid) onApply(price);
  }

  if (typeof document === "undefined") return null;
  return createPortal(
    <Modal isOpen={isOpen} onClose={onClose} title={t("fastFill")} size="sm">
      <div
        onKeyDown={(e) => {
          if (e.key !== "Enter") return;
          e.preventDefault();
          apply();
        }}
      >
        <p className="text-[13px] leading-5 text-[#475569]">
          {t("fastFillBody")}
        </p>
        <label
          htmlFor={inputId}
          className="mt-4 mb-1.5 block text-[13px] font-bold text-[#334155]"
        >
          {t("fastFillPriceLabel")}
        </label>
        <NumberField
          id={inputId}
          value={draft}
          onChange={setDraft}
          min={1}
          max={MAX_PRICE}
          integer
          suffix="₾"
          accent="blue"
          placeholder={t("fastFillPlaceholder")}
        />
        {replacedDays > 0 && (
          <p className="mt-2 text-[12px] font-semibold text-[#EA580C]">
            {t("fastFillReplaces", { count: replacedDays })}
          </p>
        )}
        <button
          type="button"
          disabled={!valid}
          onClick={apply}
          className="mt-5 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#2563EB] px-4 text-[14px] font-black text-white transition-colors hover:bg-[#1D4ED8] disabled:opacity-50"
        >
          <Zap className="size-4" strokeWidth={2.4} />
          {t("fastFillApply")}
        </button>
      </div>
    </Modal>,
    document.body,
  );
}
