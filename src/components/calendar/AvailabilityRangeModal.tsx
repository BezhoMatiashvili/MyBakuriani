"use client";

import { useMemo, useState } from "react";
import { CalendarRange, LoaderCircle, Lock, Unlock } from "lucide-react";
import { useTranslations } from "next-intl";
import Modal from "@/components/shared/Modal";
import { datesInRange } from "@/lib/utils/availability";

export type AvailabilityAction = "blocked" | "available";

interface AvailabilityRangeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onApply: (
    action: AvailabilityAction,
    dates: string[],
  ) => Promise<boolean>;
}

function localToday(): string {
  const today = new Date();
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
}

export default function AvailabilityRangeModal({
  isOpen,
  onClose,
  onApply,
}: AvailabilityRangeModalProps) {
  const t = useTranslations("RenterCalendar.availability");
  const today = useMemo(localToday, []);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [action, setAction] = useState<AvailabilityAction>("blocked");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = () => {
    if (saving) return;
    setError(null);
    onClose();
  };

  const submit = async () => {
    setError(null);
    if (!from || !to || to < from) {
      setError(t("invalidRange"));
      return;
    }
    const dates = datesInRange(from, to);
    if (dates.length === 0 || dates.length > 366) {
      setError(t("rangeTooLong"));
      return;
    }

    setSaving(true);
    try {
      const ok = await onApply(action, dates);
      if (!ok) return;
      setFrom("");
      setTo("");
      setAction("blocked");
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={close} title={t("title")}>
      <div className="rounded-2xl border border-[#E2E8F0] bg-[#F8FAFC] p-4">
        <div className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-white text-[#2563EB] shadow-sm">
            <CalendarRange className="size-5" />
          </span>
          <p className="text-[12px] font-medium leading-5 text-[#64748B]">
            {t("help")}
          </p>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="text-[12px] font-bold text-[#475569]">
            {t("from")}
          </span>
          <input
            type="date"
            min={today}
            value={from}
            onChange={(event) => {
              const value = event.target.value;
              setFrom(value);
              if (to && to < value) setTo(value);
              setError(null);
            }}
            className="mt-1.5 h-12 w-full rounded-xl border border-[#E2E8F0] bg-white px-3 text-[13px] font-bold text-[#0F172A] outline-none focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/10"
          />
        </label>
        <label className="block">
          <span className="text-[12px] font-bold text-[#475569]">
            {t("to")}
          </span>
          <input
            type="date"
            min={from || today}
            value={to}
            onChange={(event) => {
              setTo(event.target.value);
              setError(null);
            }}
            className="mt-1.5 h-12 w-full rounded-xl border border-[#E2E8F0] bg-white px-3 text-[13px] font-bold text-[#0F172A] outline-none focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/10"
          />
        </label>
      </div>

      <fieldset className="mt-5">
        <legend className="text-[12px] font-bold text-[#475569]">
          {t("action")}
        </legend>
        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <button
            type="button"
            aria-pressed={action === "blocked"}
            onClick={() => setAction("blocked")}
            className={`flex min-h-12 items-center justify-center gap-2 rounded-xl border px-4 text-[12px] font-black transition-colors ${
              action === "blocked"
                ? "border-[#D97706] bg-[#FEF3C7] text-[#92400E]"
                : "border-[#E2E8F0] bg-white text-[#64748B] hover:bg-[#F8FAFC]"
            }`}
          >
            <Lock className="size-4" />
            {t("block")}
          </button>
          <button
            type="button"
            aria-pressed={action === "available"}
            onClick={() => setAction("available")}
            className={`flex min-h-12 items-center justify-center gap-2 rounded-xl border px-4 text-[12px] font-black transition-colors ${
              action === "available"
                ? "border-[#16A34A] bg-[#DCFCE7] text-[#166534]"
                : "border-[#E2E8F0] bg-white text-[#64748B] hover:bg-[#F8FAFC]"
            }`}
          >
            <Unlock className="size-4" />
            {t("unblock")}
          </button>
        </div>
      </fieldset>

      {error && (
        <p className="mt-3 rounded-xl bg-[#FEF2F2] px-3 py-2.5 text-[11px] font-bold text-[#B91C1C]">
          {error}
        </p>
      )}

      <div className="mt-6 grid grid-cols-2 gap-3">
        <button
          type="button"
          disabled={saving}
          onClick={close}
          className="min-h-12 rounded-xl border border-[#E2E8F0] bg-white px-4 text-[13px] font-bold text-[#475569] disabled:opacity-50"
        >
          {t("cancel")}
        </button>
        <button
          type="button"
          disabled={saving || !from || !to}
          onClick={() => void submit()}
          className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#2563EB] px-4 text-[13px] font-black text-white transition-colors hover:bg-[#1D4ED8] disabled:opacity-50"
        >
          {saving && <LoaderCircle className="size-4 animate-spin" />}
          {t("apply")}
        </button>
      </div>
    </Modal>
  );
}
