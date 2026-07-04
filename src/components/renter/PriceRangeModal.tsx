"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { AnimatePresence, motion } from "framer-motion";
import { X, Tag } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { revalidatePublicProperty } from "@/app/actions/revalidateListing";
import DateField from "@/components/shared/DateField";
import NumberField from "@/components/shared/NumberField";

type Filter = "all" | "weekdays" | "weekends";

interface PriceRangeModalProps {
  isOpen: boolean;
  onClose: () => void;
  propertyId: string;
  basePrice: number;
  onSaved?: () => void | Promise<void>;
}

const WEEKEND_INDICES = [4, 5, 6]; // mon=0 .. sun=6

function isoFor(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function enumerateDates(from: string, to: string, filter: Filter): string[] {
  if (!from || !to || from > to) return [];
  const start = new Date(from + "T00:00:00");
  const end = new Date(to + "T00:00:00");
  const out: string[] = [];
  const cur = new Date(start);
  while (cur <= end) {
    const monIdx = (cur.getDay() + 6) % 7;
    const isWeekend = WEEKEND_INDICES.includes(monIdx);
    if (
      filter === "all" ||
      (filter === "weekdays" && !isWeekend) ||
      (filter === "weekends" && isWeekend)
    ) {
      out.push(isoFor(cur));
    }
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

export default function PriceRangeModal({
  isOpen,
  onClose,
  propertyId,
  basePrice,
  onSaved,
}: PriceRangeModalProps) {
  const t = useTranslations("RenterDashboard.modals.priceRange");
  const tShared = useTranslations("DashboardShared");

  const supabase = createClient();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [price, setPrice] = useState<string>("");
  const [filter, setFilter] = useState<Filter>("all");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  useEffect(() => {
    if (!isOpen) return;
    setFrom("");
    setTo("");
    setPrice("");
    setFilter("all");
    setError(null);
  }, [isOpen]);

  const dates = useMemo(
    () => enumerateDates(from, to, filter),
    [from, to, filter],
  );

  const valid =
    !!from &&
    !!to &&
    from <= to &&
    !!price &&
    Number.isFinite(Number(price)) &&
    Number(price) >= 0 &&
    dates.length > 0;

  const handleSubmit = async () => {
    if (!valid) return;
    setSaving(true);
    setError(null);
    const value = Number(price);
    const rows = dates.map((d) => ({
      property_id: propertyId,
      date: d,
      price: value,
    }));
    const { error: err } = await supabase
      .from("price_overrides")
      .upsert(rows, { onConflict: "property_id,date" });
    setSaving(false);
    if (err) {
      setError(err.message);
      return;
    }
    await onSaved?.();
    await revalidatePublicProperty(propertyId);
    onClose();
  };

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
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#FFEDD5] text-[#F97316]">
                  <Tag className="h-4 w-4" strokeWidth={2.3} />
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
              <Field label={tShared("from")}>
                <DateField
                  value={from}
                  onChange={setFrom}
                  className="h-[42px]"
                />
              </Field>
              <Field label={tShared("to")}>
                <DateField
                  value={to}
                  onChange={setTo}
                  min={from || undefined}
                  className="h-[42px]"
                />
              </Field>
            </div>

            <div className="mt-3">
              <Field label={t("pricePerNight")}>
                <NumberField
                  value={price}
                  onChange={setPrice}
                  min={0}
                  max={99999}
                  decimals={2}
                  placeholder={basePrice ? String(basePrice) : "0"}
                  suffix="₾"
                />
              </Field>
            </div>

            <div className="mt-3">
              <Field label={t("applyTo")}>
                <div className="grid grid-cols-3 gap-2">
                  <FilterButton
                    active={filter === "all"}
                    onClick={() => setFilter("all")}
                    label={tShared("allDays")}
                  />
                  <FilterButton
                    active={filter === "weekdays"}
                    onClick={() => setFilter("weekdays")}
                    label={tShared("weekdays")}
                  />
                  <FilterButton
                    active={filter === "weekends"}
                    onClick={() => setFilter("weekends")}
                    label={tShared("weekends")}
                  />
                </div>
              </Field>
            </div>

            <div className="mt-4 rounded-xl bg-[#F8FAFC] px-4 py-3 text-[12px] font-semibold text-[#64748B]">
              {from && to && from <= to
                ? tShared("daysPriceChange", { count: dates.length })
                : tShared("selectDateRange")}
            </div>

            {error && (
              <p className="mt-3 text-[12px] font-semibold text-[#EF4444]">
                {error}
              </p>
            )}

            <button
              type="button"
              disabled={!valid || saving}
              onClick={handleSubmit}
              className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#F97316] py-3 text-[13px] font-black text-white transition-colors hover:bg-[#EA580C] disabled:opacity-50"
            >
              {saving ? tShared("saving") : tShared("apply")}
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

function FilterButton({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-xl border px-3 py-2 text-[12px] font-bold transition-colors ${
        active
          ? "border-[#F97316] bg-[#FFF7ED] text-[#F97316]"
          : "border-[#E2E8F0] bg-white text-[#64748B] hover:bg-[#F8FAFC]"
      }`}
    >
      {label}
    </button>
  );
}
