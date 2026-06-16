"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { AnimatePresence, motion } from "framer-motion";
import { X, UserPlus } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/hooks/useAuth";
import NumberField from "@/components/shared/NumberField";
import type { Tables } from "@/lib/types/database";

interface CleanerFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
  cleaner?: Tables<"renter_cleaners"> | null;
}

export default function CleanerFormModal({
  isOpen,
  onClose,
  onSaved,
  cleaner,
}: CleanerFormModalProps) {
  const t = useTranslations("RenterDashboard.modals.cleanerForm");
  const tShared = useTranslations("DashboardShared");

  const { user } = useAuth();
  const supabase = createClient();

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [priceStandard, setPriceStandard] = useState("");
  const [priceGeneral, setPriceGeneral] = useState("");
  const [available, setAvailable] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setName(cleaner?.name ?? "");
    setPhone(cleaner?.phone ?? "");
    setPriceStandard(
      cleaner?.price_standard != null ? String(cleaner.price_standard) : "",
    );
    setPriceGeneral(
      cleaner?.price_general != null ? String(cleaner.price_general) : "",
    );
    setAvailable(cleaner?.available ?? true);
  }, [isOpen, cleaner]);

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

  const handleSubmit = async () => {
    if (!name.trim() || saving) return;
    setSaving(true);

    const toNumberOrNull = (v: string) => {
      const trimmed = v.trim();
      if (trimmed === "") return null;
      const n = Number(trimmed);
      return Number.isNaN(n) ? null : n;
    };

    const payload = {
      name: name.trim(),
      phone: phone.trim() || null,
      price_standard: toNumberOrNull(priceStandard),
      price_general: toNumberOrNull(priceGeneral),
      available,
    };

    try {
      if (cleaner) {
        await supabase
          .from("renter_cleaners")
          .update(payload)
          .eq("id", cleaner.id);
      } else {
        if (!user) return;
        await supabase
          .from("renter_cleaners")
          .insert({ owner_id: user.id, ...payload });
      }
      onSaved();
      onClose();
    } finally {
      setSaving(false);
    }
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
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#DBEAFE] text-[#2563EB]">
                  <UserPlus className="h-4 w-4" strokeWidth={2.3} />
                </span>
                <h2 className="text-[16px] font-black text-[#0F172A]">
                  {cleaner ? t("editTitle") : t("newTitle")}
                </h2>
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

            <div className="mt-5 space-y-3">
              <Field label={tShared("name")}>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t("namePlaceholder")}
                  className="w-full rounded-xl border border-[#E2E8F0] bg-white px-4 py-2.5 text-[13px] font-semibold text-[#0F172A] focus:border-[#2563EB] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/10"
                />
              </Field>

              <Field label={tShared("phone")}>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="599 11 22 33"
                  className="w-full rounded-xl border border-[#E2E8F0] bg-white px-4 py-2.5 text-[13px] font-semibold text-[#0F172A] focus:border-[#2563EB] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/10"
                />
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label={t("priceStandard")}>
                  <NumberField
                    value={priceStandard}
                    onChange={setPriceStandard}
                    min={0}
                    decimals={2}
                    suffix="₾"
                    placeholder="30"
                  />
                </Field>
                <Field label={t("priceGeneral")}>
                  <NumberField
                    value={priceGeneral}
                    onChange={setPriceGeneral}
                    min={0}
                    decimals={2}
                    suffix="₾"
                    placeholder="50"
                  />
                </Field>
              </div>
            </div>

            <button
              type="button"
              onClick={handleSubmit}
              disabled={!name.trim() || saving}
              className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#2563EB] py-3 text-[13px] font-black text-white transition-colors hover:bg-[#1E40AF] disabled:opacity-50"
            >
              {tShared("save")}
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
