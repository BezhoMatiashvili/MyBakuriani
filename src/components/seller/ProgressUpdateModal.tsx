"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import NumberField from "@/components/shared/NumberField";
import type { Tables } from "@/lib/types/database";

interface Props {
  property: Tables<"properties"> | null;
  onClose: () => void;
  onSaved: (updated: Tables<"properties">) => void;
}

const NOTE_MAX = 1000;
const CURRENT_YEAR = new Date().getFullYear();
const MIN_YEAR = CURRENT_YEAR - 5;
const MAX_YEAR = CURRENT_YEAR + 15;

export default function ProgressUpdateModal({
  property,
  onClose,
  onSaved,
}: Props) {
  const t = useTranslations("SellerDashboard.progressModal");
  const tShared = useTranslations("DashboardShared");
  const tAdmin = useTranslations("AdminShared");

  const open = property !== null;
  const [percent, setPercent] = useState(0);
  const [year, setYear] = useState<string>("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!property) return;
    setPercent(property.construction_progress_percent ?? 0);
    setYear(
      property.completion_year != null ? String(property.completion_year) : "",
    );
    setNote(property.progress_note ?? "");
    setError(null);
  }, [property]);

  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = "hidden";
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", handleKey);
    };
  }, [open, onClose]);

  async function handleSave() {
    if (!property) return;
    setSaving(true);
    setError(null);
    try {
      const supabase = createClient();
      const yearNum = year.trim() ? Number(year) : null;
      if (
        yearNum !== null &&
        (!Number.isInteger(yearNum) || yearNum < MIN_YEAR || yearNum > MAX_YEAR)
      ) {
        throw new Error(t("yearRange", { min: MIN_YEAR, max: MAX_YEAR }));
      }
      const trimmedNote = note.trim();

      const { data, error: updateError } = await supabase
        .from("properties")
        .update({
          construction_progress_percent: percent,
          completion_year: yearNum,
          progress_note: trimmedNote || null,
          progress_note_updated_at: new Date().toISOString(),
        })
        .eq("id", property.id)
        .eq("owner_id", property.owner_id)
        .select("*")
        .single();

      if (updateError) throw updateError;
      if (data) {
        onSaved(data as Tables<"properties">);
        onClose();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : tAdmin("saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <AnimatePresence>
      {open && property && (
        <div className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center">
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
            className="relative z-10 w-full max-w-[520px] overflow-hidden rounded-[24px] bg-white shadow-[0px_25px_50px_-12px_rgba(0,0,0,0.35)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 border-b border-[#F1F5F9] px-6 py-5">
              <div>
                <h2 className="text-[17px] font-black text-[#0F172A]">
                  {t("title")}
                </h2>
                <p className="mt-0.5 truncate text-[12px] text-[#64748B]">
                  {property.title}
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="flex size-8 items-center justify-center rounded-full text-[#94A3B8] transition-colors hover:bg-[#F1F5F9]"
                aria-label={tShared("closeAria")}
              >
                <X className="size-4" />
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSave();
              }}
              noValidate
            >
              <div className="max-h-[70vh] space-y-5 overflow-y-auto px-6 py-5">
                <div>
                  <div className="mb-2 flex items-center justify-between text-[12px]">
                    <span className="font-bold text-[#334155]">
                      {t("readiness")}
                    </span>
                    <span className="font-black text-[#16A34A]">
                      {percent}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={1}
                    value={percent}
                    onChange={(e) => setPercent(Number(e.target.value))}
                    className="w-full accent-[#16A34A]"
                  />
                  <div className="mt-1 flex justify-between text-[10px] font-medium text-[#94A3B8]">
                    <span>0%</span>
                    <span>50%</span>
                    <span>100%</span>
                  </div>
                </div>

                <div>
                  <label className="mb-1.5 block text-[12px] font-bold text-[#334155]">
                    {t("completionYear")}
                  </label>
                  <NumberField
                    value={year}
                    onChange={setYear}
                    integer
                    min={MIN_YEAR}
                    max={MAX_YEAR}
                    accent="green"
                    placeholder={String(CURRENT_YEAR + 1)}
                  />
                </div>

                <div>
                  <div className="mb-1.5 flex items-center justify-between">
                    <label className="text-[12px] font-bold text-[#334155]">
                      {t("updateComment")}
                    </label>
                    <span className="text-[10px] font-medium text-[#94A3B8]">
                      {note.length} / {NOTE_MAX}
                    </span>
                  </div>
                  <textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value.slice(0, NOTE_MAX))}
                    placeholder={t("commentPlaceholder")}
                    rows={4}
                    className="min-h-[110px] w-full resize-y rounded-xl border border-[#E2E8F0] bg-white px-4 py-3 text-sm outline-none transition-colors focus:border-[#16A34A] focus:ring-2 focus:ring-[#DCFCE7]"
                  />
                </div>

                {error && (
                  <p className="rounded-lg bg-red-50 px-3 py-2 text-xs font-semibold text-red-600">
                    {error}
                  </p>
                )}
              </div>

              <div className="flex items-center justify-end gap-2 border-t border-[#F1F5F9] px-6 py-4">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={saving}
                  className="rounded-xl border border-[#E2E8F0] bg-white px-4 py-2.5 text-[13px] font-bold text-[#334155] transition-colors hover:bg-[#F8FAFC] disabled:opacity-60"
                >
                  {tShared("cancel")}
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-xl bg-[#16A34A] px-5 py-2.5 text-[13px] font-bold text-white transition-colors hover:bg-[#15803D] disabled:opacity-60"
                >
                  {saving ? tShared("saving") : tShared("save")}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
