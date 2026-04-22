"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { AnimatePresence, motion } from "framer-motion";
import { X, Home, CreditCard } from "lucide-react";
import type { VipInfoTier } from "./VipInfoModal";

export interface PickerProperty {
  id: string;
  title: string;
  subtitle?: string;
  photoUrl?: string | null;
}

const TIER_META: Record<
  VipInfoTier,
  { title: string; price: string; unit: string }
> = {
  "super-vip": {
    title: "SUPER VIP",
    price: "5.00 ₾",
    unit: "/ 24სთ",
  },
  vip: { title: "VIP", price: "1.50 ₾", unit: "/ დღე" },
  discount: { title: "ფასდაკლების ბეჯი", price: "1.00 ₾", unit: "/ დღე" },
  sms: { title: "SMS პაკეტი", price: "10.00 ₾", unit: "/ 200 SMS" },
};

interface VipPropertyPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  tier: VipInfoTier;
  properties: PickerProperty[];
  onConfirm?: (propertyId: string) => void;
  loading?: boolean;
}

export default function VipPropertyPickerModal({
  isOpen,
  onClose,
  tier,
  properties,
  onConfirm,
  loading,
}: VipPropertyPickerModalProps) {
  const [selectedId, setSelectedId] = useState<string>(properties[0]?.id ?? "");

  useEffect(() => {
    if (properties.length > 0 && !selectedId) {
      setSelectedId(properties[0].id);
    }
  }, [properties, selectedId]);

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

  const meta = TIER_META[tier];

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
            className="relative z-10 w-full max-w-[540px] rounded-[24px] bg-white p-6 shadow-[0px_24px_60px_-12px_rgba(15,23,42,0.25)]"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-[17px] font-black text-[#0F172A]">
                  აირჩიეთ განცხადება
                </h2>
                <p className="mt-1 text-[12px] font-medium text-[#64748B]">
                  შეიძინეთ {meta.title} თქვენი ობიექტისთვის.
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="flex h-8 w-8 items-center justify-center rounded-full text-[#94A3B8] hover:bg-[#F1F5F9]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-5 max-h-[320px] space-y-2 overflow-y-auto pr-1">
              {properties.length === 0 && (
                <div className="rounded-xl border border-dashed border-[#E2E8F0] bg-[#FAFBFC] px-4 py-6 text-center text-[13px] text-[#94A3B8]">
                  აქტიური ობიექტი ვერ მოიძებნა
                </div>
              )}
              {properties.map((p) => {
                const isSelected = selectedId === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setSelectedId(p.id)}
                    className={`flex w-full items-center gap-3 rounded-2xl border p-3 text-left transition-colors ${
                      isSelected
                        ? "border-[#2563EB] bg-[#EFF6FF]"
                        : "border-[#EEF1F4] bg-white hover:border-[#CBD5E1]"
                    }`}
                  >
                    <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-xl bg-[#F1F5F9]">
                      {p.photoUrl ? (
                        <Image
                          src={p.photoUrl}
                          alt={p.title}
                          fill
                          className="object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center">
                          <Home className="h-5 w-5 text-[#94A3B8]" />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-extrabold text-[#0F172A]">
                        {p.title}
                      </p>
                      {p.subtitle && (
                        <p className="mt-0.5 truncate text-[11px] font-medium text-[#94A3B8]">
                          {p.subtitle}
                        </p>
                      )}
                    </div>
                    <span
                      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${
                        isSelected
                          ? "border-[#2563EB] bg-[#2563EB]"
                          : "border-[#CBD5E1] bg-white"
                      }`}
                    >
                      {isSelected && (
                        <span className="h-2 w-2 rounded-full bg-white" />
                      )}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="mt-5 flex items-center justify-between gap-4 border-t border-[#EEF1F4] pt-5">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-[#94A3B8]">
                  {meta.title}-ის ფასი
                </p>
                <p className="mt-1 text-[20px] font-black text-[#0F172A]">
                  {meta.price}
                  <span className="ml-1 text-[12px] font-bold text-[#94A3B8]">
                    {meta.unit}
                  </span>
                </p>
              </div>
              <button
                type="button"
                disabled={!selectedId || loading}
                onClick={() => {
                  if (selectedId) {
                    onConfirm?.(selectedId);
                    onClose();
                  }
                }}
                className="inline-flex items-center gap-2 rounded-xl bg-[#2563EB] px-5 py-3 text-[13px] font-black text-white shadow-[0_1px_2px_rgba(37,99,235,0.3)] transition-colors hover:bg-[#1E40AF] disabled:opacity-50"
              >
                <CreditCard className="h-4 w-4" />
                გადახდა
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
