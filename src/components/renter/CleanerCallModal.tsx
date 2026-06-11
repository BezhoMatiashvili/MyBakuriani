"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { AnimatePresence, motion } from "framer-motion";
import { X, Sparkles } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/hooks/useAuth";
import { optionKeyFor } from "@/lib/constants/listing-options";
import DateField from "@/components/shared/DateField";
import TimeField from "@/components/shared/TimeField";

interface PropertyOption {
  id: string;
  title: string;
  location: string | null;
}

interface CleanerCallModalProps {
  isOpen: boolean;
  onClose: () => void;
  cleaner: { cleanerId: string; name: string } | null;
  onSent?: () => void;
  prefill?: {
    propertyId?: string;
    cleaningType?: string;
    price?: number;
    address?: string;
    notes?: string;
  };
}

export default function CleanerCallModal({
  isOpen,
  onClose,
  cleaner,
  onSent,
  prefill,
}: CleanerCallModalProps) {
  const t = useTranslations("RenterCleaners.callModal");
  const tShared = useTranslations("DashboardShared");
  const tOpts = useTranslations("ListingOptions");
  const { user } = useAuth();
  const supabase = createClient();

  const [properties, setProperties] = useState<PropertyOption[]>([]);
  const [propertyId, setPropertyId] = useState("");
  const [cleaningType, setCleaningType] = useState<"standard" | "general">(
    "standard",
  );
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [price, setPrice] = useState("");
  const [address, setAddress] = useState("");
  const [addressEdited, setAddressEdited] = useState(false);
  const [notes, setNotes] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset form from prefill on every open.
  useEffect(() => {
    if (!isOpen) return;
    setPropertyId(prefill?.propertyId ?? "");
    // Legacy rows store Georgian labels ("გენერალური"/"სტანდარტული") —
    // normalize via the shared reverse map before matching.
    setCleaningType(
      optionKeyFor("cleaningTypes", prefill?.cleaningType ?? null) === "general"
        ? "general"
        : "standard",
    );
    setDate("");
    setTime("");
    setPrice(prefill?.price != null ? String(prefill.price) : "");
    setAddress(prefill?.address ?? "");
    setAddressEdited(Boolean(prefill?.address));
    setNotes(prefill?.notes ?? "");
    setError(null);
  }, [isOpen, prefill]);

  useEffect(() => {
    if (!isOpen || !user) return;
    supabase
      .from("properties")
      .select("id, title, location")
      .eq("owner_id", user.id)
      .eq("is_for_sale", false)
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        if (data) setProperties(data);
      });
  }, [isOpen, user, supabase]);

  // Auto-fill the address from the selected property until the user edits it.
  useEffect(() => {
    if (!propertyId || addressEdited) return;
    const selected = properties.find((p) => p.id === propertyId);
    if (selected) setAddress(selected.location ?? "");
  }, [propertyId, properties, addressEdited]);

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

  const priceNumber = Number(price.trim());
  const canSubmit =
    propertyId !== "" &&
    date !== "" &&
    time !== "" &&
    price.trim() !== "" &&
    !Number.isNaN(priceNumber);

  const handleSubmit = async () => {
    if (!canSubmit || sending || !user || !cleaner) return;
    setSending(true);
    setError(null);

    const { error: insertError } = await supabase
      .from("cleaning_tasks")
      .insert({
        property_id: propertyId,
        owner_id: user.id,
        cleaner_id: cleaner.cleanerId,
        cleaning_type: cleaningType,
        scheduled_at: new Date(`${date}T${time}`).toISOString(),
        price: priceNumber,
        address: address.trim() || null,
        notes: notes.trim() || null,
        status: "pending",
      });

    setSending(false);
    if (insertError) {
      setError(t("sendError"));
      return;
    }
    onSent?.();
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && cleaner && (
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
            className="relative z-10 max-h-[90vh] w-full max-w-[520px] overflow-y-auto rounded-[24px] bg-white p-6 shadow-[0px_24px_60px_-12px_rgba(15,23,42,0.25)]"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#DBEAFE] text-[#2563EB]">
                  <Sparkles className="h-4 w-4" strokeWidth={2.3} />
                </span>
                <div>
                  <h2 className="text-[16px] font-black text-[#0F172A]">
                    {t("title")}
                  </h2>
                  <p className="text-[12px] font-semibold text-[#64748B]">
                    {cleaner.name}
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

            <div className="mt-5 space-y-3">
              <Field label={tShared("defaultProperty")}>
                <select
                  value={propertyId}
                  onChange={(e) => setPropertyId(e.target.value)}
                  className="w-full rounded-xl border border-[#E2E8F0] bg-white px-4 py-2.5 text-[13px] font-semibold text-[#0F172A] focus:border-[#2563EB] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/10"
                >
                  <option value="">{tShared("selectProperty")}</option>
                  {properties.map((property) => (
                    <option key={property.id} value={property.id}>
                      {property.title}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label={t("cleaningType")}>
                <div className="grid grid-cols-2 gap-2">
                  {(
                    [
                      // value = exact DB payload for cleaning_tasks.cleaning_type
                      {
                        value: "standard",
                        label: tOpts("cleaningTypes.standard"),
                      },
                      {
                        value: "general",
                        label: tOpts("cleaningTypes.general"),
                      },
                    ] as const
                  ).map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setCleaningType(option.value)}
                      className={`rounded-xl py-2.5 text-[13px] font-bold transition-colors ${
                        cleaningType === option.value
                          ? "bg-[#2563EB] text-white shadow-[0_1px_2px_rgba(37,99,235,0.3)]"
                          : "border border-[#E2E8F0] bg-white text-[#64748B] hover:border-[#2563EB] hover:text-[#2563EB]"
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label={tShared("date")}>
                  <DateField
                    value={date}
                    onChange={setDate}
                    className="h-[42px]"
                  />
                </Field>
                <Field label={tShared("time")}>
                  <TimeField
                    value={time}
                    onChange={setTime}
                    className="h-[42px]"
                  />
                </Field>
              </div>

              <Field label={t("price")}>
                <div className="relative">
                  <input
                    type="number"
                    inputMode="decimal"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    placeholder="30"
                    className="w-full rounded-xl border border-[#E2E8F0] bg-white px-4 py-2.5 pr-10 text-[13px] font-semibold text-[#0F172A] focus:border-[#2563EB] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/10"
                  />
                  <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-[13px] font-bold text-[#94A3B8]">
                    ₾
                  </span>
                </div>
              </Field>

              <Field label={t("address")}>
                <input
                  type="text"
                  value={address}
                  onChange={(e) => {
                    setAddress(e.target.value);
                    setAddressEdited(true);
                  }}
                  placeholder={t("address")}
                  className="w-full rounded-xl border border-[#E2E8F0] bg-white px-4 py-2.5 text-[13px] font-semibold text-[#0F172A] focus:border-[#2563EB] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/10"
                />
              </Field>

              <Field label={tShared("note")}>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  placeholder={t("notesPlaceholder")}
                  className="w-full resize-none rounded-xl border border-[#E2E8F0] bg-white px-4 py-2.5 text-[13px] font-semibold text-[#0F172A] focus:border-[#2563EB] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/10"
                />
              </Field>
            </div>

            {error && (
              <p className="mt-3 rounded-xl bg-[#FEF2F2] px-4 py-2.5 text-[12px] font-bold text-[#EF4444]">
                {error}
              </p>
            )}

            <button
              type="button"
              onClick={handleSubmit}
              disabled={!canSubmit || sending}
              className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#2563EB] py-3 text-[13px] font-black text-white transition-colors hover:bg-[#1E40AF] disabled:opacity-50"
            >
              {sending ? t("sending") : t("submit")}
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
