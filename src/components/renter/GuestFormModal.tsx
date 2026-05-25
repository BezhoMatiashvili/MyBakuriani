"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X, UserPlus } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/hooks/useAuth";
import type { Tables } from "@/lib/types/database";

interface GuestFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
  guest?: Tables<"renter_guests"> | null;
}

export default function GuestFormModal({
  isOpen,
  onClose,
  onSaved,
  guest,
}: GuestFormModalProps) {
  const { user } = useAuth();
  const supabase = createClient();

  const isEdit = Boolean(guest);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [visitDates, setVisitDates] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setName(guest?.name ?? "");
      setPhone(guest?.phone ?? "");
      setVisitDates(guest?.visit_dates ?? "");
      setNote(guest?.note ?? "");
    }
  }, [isOpen, guest]);

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
    const trimmedName = name.trim();
    if (!trimmedName || saving) return;

    setSaving(true);
    try {
      const payload = {
        name: trimmedName,
        phone: phone.trim() || null,
        visit_dates: visitDates.trim() || null,
        note: note.trim() || null,
      };

      if (isEdit && guest) {
        await supabase.from("renter_guests").update(payload).eq("id", guest.id);
      } else {
        if (!user) return;
        await supabase
          .from("renter_guests")
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
                <div>
                  <h2 className="text-[16px] font-black text-[#0F172A]">
                    {isEdit ? "სტუმრის რედაქტირება" : "ახალი სტუმარი"}
                  </h2>
                  <p className="mt-0.5 text-[12px] font-medium text-[#64748B]">
                    შეინახეთ თქვენი სტუმრების ინფორმაცია
                  </p>
                </div>
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

            <div className="mt-5 space-y-3">
              <Field label="სახელი">
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="ნინო მახარაძე"
                  className="w-full rounded-xl border border-[#E2E8F0] bg-white px-4 py-2.5 text-[13px] font-semibold text-[#0F172A] focus:border-[#2563EB] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/10"
                />
              </Field>

              <Field label="ტელეფონი">
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="599 12 34 56"
                  className="w-full rounded-xl border border-[#E2E8F0] bg-white px-4 py-2.5 text-[13px] font-semibold text-[#0F172A] focus:border-[#2563EB] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/10"
                />
              </Field>

              <Field label="ვიზიტის თარიღები">
                <input
                  type="text"
                  value={visitDates}
                  onChange={(e) => setVisitDates(e.target.value)}
                  placeholder="10-12 თებ."
                  className="w-full rounded-xl border border-[#E2E8F0] bg-white px-4 py-2.5 text-[13px] font-semibold text-[#0F172A] focus:border-[#2563EB] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/10"
                />
              </Field>

              <Field label="შენიშვნა">
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={3}
                  placeholder="მშვიდი, სუფთა სტუმარია."
                  className="w-full resize-none rounded-xl border border-[#E2E8F0] bg-white px-4 py-2.5 text-[13px] font-semibold text-[#0F172A] focus:border-[#2563EB] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/10"
                />
              </Field>
            </div>

            <button
              type="button"
              onClick={handleSubmit}
              disabled={!name.trim() || saving}
              className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#2563EB] py-3 text-[13px] font-black text-white transition-colors hover:bg-[#1E40AF] disabled:opacity-50"
            >
              {saving ? "..." : "შენახვა"}
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
