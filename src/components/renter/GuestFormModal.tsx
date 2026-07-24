"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { AnimatePresence, motion } from "framer-motion";
import { X, UserPlus } from "lucide-react";
import DateField from "@/components/shared/DateField";
import PhoneInput from "@/components/forms/PhoneInput";
import { isValidGePhone, toLocalGePhone } from "@/lib/utils/number";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/hooks/useAuth";
import type { Tables } from "@/lib/types/database";

interface GuestFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
  guest?: Tables<"renter_guests"> | null;
  bookingGuest?: Tables<"renter_guests"> | null;
  properties: Tables<"properties">[];
}

export default function GuestFormModal({
  isOpen,
  onClose,
  onSaved,
  guest,
  bookingGuest,
  properties,
}: GuestFormModalProps) {
  const t = useTranslations("RenterDashboard.modals.guestForm");
  const tShared = useTranslations("DashboardShared");

  const { user } = useAuth();
  const supabase = createClient();

  const isEdit = Boolean(guest) && !bookingGuest;
  const activeGuest = bookingGuest ?? guest;

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [checkIn, setCheckIn] = useState("");
  const [checkOut, setCheckOut] = useState("");
  const [note, setNote] = useState("");
  const [propertyId, setPropertyId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      const [legacyCheckIn, legacyCheckOut] = bookingGuest
        ? splitVisitDates(bookingGuest.visit_dates)
        : ["", ""];
      setName(activeGuest?.name ?? "");
      setPhone(toLocalGePhone(activeGuest?.phone));
      setCheckIn(legacyCheckIn);
      setCheckOut(legacyCheckOut);
      setNote(activeGuest?.note ?? "");
      setPropertyId(properties[0]?.id ?? "");
      setError(null);
    }
  }, [isOpen, activeGuest, bookingGuest, properties]);

  const datesValid = Boolean(checkIn && checkOut && checkOut >= checkIn);

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
    if (
      !trimmedName ||
      (!isEdit && (!datesValid || !propertyId)) ||
      saving ||
      (phone && !isValidGePhone(phone))
    )
      return;

    setSaving(true);
    try {
      const payload = {
        name: trimmedName,
        phone: phone ? "+995" + phone : null,
        note: note.trim() || null,
      };

      if (isEdit && guest) {
        const { error: updateError } = await supabase
          .from("renter_guests")
          .update(payload)
          .eq("id", guest.id);
        if (updateError) throw updateError;
      } else if (bookingGuest) {
        if (!propertyId) return;
        const { error: bookingError } = await supabase.rpc(
          "create_manual_booking",
          {
            p_property_id: propertyId,
            p_check_in: checkIn,
            p_check_out: checkOut,
            p_guest_name: trimmedName,
            p_guest_phone: payload.phone ?? undefined,
            p_note: payload.note ?? undefined,
            p_renter_guest_id: bookingGuest.id,
          },
        );
        if (bookingError) throw bookingError;
        // A legacy free-text visit is only migrated when the owner explicitly
        // creates this property-bound booking; ambiguous text otherwise stays.
        if (bookingGuest.visit_dates) {
          const { error: clearError } = await supabase
            .from("renter_guests")
            .update({ visit_dates: null })
            .eq("id", bookingGuest.id);
          if (clearError) throw clearError;
        }
      } else {
        if (!user) return;
        if (!propertyId) return;
        const { error: bookingError } = await supabase.rpc(
          "create_guest_manual_booking",
          {
            p_property_id: propertyId,
            p_check_in: checkIn,
            p_check_out: checkOut,
            p_name: trimmedName,
            p_phone: payload.phone ?? undefined,
            p_note: payload.note ?? undefined,
          },
        );
        if (bookingError) throw bookingError;
      }

      onSaved();
      onClose();
    } catch (submitError) {
      console.error("Failed to save guest", submitError);
      setError(tShared("genericRetry"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
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
            className="relative z-10 max-h-[90dvh] w-full max-w-[520px] overflow-y-auto rounded-t-[24px] bg-white p-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] shadow-[0px_24px_60px_-12px_rgba(15,23,42,0.25)] sm:rounded-[24px] sm:pb-6"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#DBEAFE] text-[#2563EB]">
                  <UserPlus className="h-4 w-4" strokeWidth={2.3} />
                </span>
                <div>
                  <h2 className="text-[16px] font-black text-[#0F172A]">
                    {isEdit ? t("editTitle") : t("newTitle")}
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

            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSubmit();
              }}
              noValidate
            >
              <div className="mt-5 space-y-3">
                <Field label={tShared("name")}>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    disabled={Boolean(bookingGuest)}
                    placeholder={t("namePlaceholder")}
                    className="w-full rounded-xl border border-[#E2E8F0] bg-white px-4 py-2.5 text-[13px] font-semibold text-[#0F172A] focus:border-[#2563EB] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/10"
                  />
                </Field>

                <Field label={tShared("phone")}>
                  <PhoneInput
                    value={phone}
                    onChange={setPhone}
                    error={
                      phone && !isValidGePhone(phone)
                        ? tShared("invalidPhone")
                        : null
                    }
                  />
                </Field>

                {!isEdit && (
                  <>
                    <Field label={tShared("defaultProperty")}>
                      <select
                        value={propertyId}
                        onChange={(e) => setPropertyId(e.target.value)}
                        className="w-full rounded-xl border border-[#E2E8F0] bg-white px-4 py-2.5 text-[13px] font-semibold text-[#0F172A] focus:border-[#2563EB] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/10"
                      >
                        <option value="" disabled>
                          {tShared("selectProperty")}
                        </option>
                        {properties.map((property) => (
                          <option key={property.id} value={property.id}>
                            {property.title}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <Field label={t("checkIn")}>
                        <DateField value={checkIn} onChange={setCheckIn} />
                      </Field>
                      <Field label={t("checkOut")}>
                        <DateField value={checkOut} onChange={setCheckOut} />
                      </Field>
                    </div>
                  </>
                )}

                <Field label={tShared("note")}>
                  <textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    rows={3}
                    placeholder={t("notePlaceholder")}
                    className="w-full resize-none rounded-xl border border-[#E2E8F0] bg-white px-4 py-2.5 text-[13px] font-semibold text-[#0F172A] focus:border-[#2563EB] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/10"
                  />
                </Field>
              </div>

              <button
                type="submit"
                disabled={
                  !name.trim() ||
                  (!isEdit && (!datesValid || !propertyId)) ||
                  saving ||
                  (phone && !isValidGePhone(phone))
                    ? true
                    : false
                }
                className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#2563EB] py-3 text-[13px] font-black text-white transition-colors hover:bg-[#1E40AF] disabled:opacity-50"
              >
                {saving ? tShared("saving") : tShared("save")}
              </button>
              {error && (
                <p className="mt-3 text-center text-[12px] font-semibold text-[#B91C1C]">
                  {error}
                </p>
              )}
            </form>
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

function splitVisitDates(raw: string | null): [string, string] {
  const [checkIn = "", checkOut = ""] = (raw ?? "").split("/");
  const iso = /^\d{4}-\d{2}-\d{2}$/;
  return iso.test(checkIn) && iso.test(checkOut)
    ? [checkIn, checkOut]
    : ["", ""];
}
