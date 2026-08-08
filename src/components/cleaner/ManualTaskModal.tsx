"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { AnimatePresence, motion } from "framer-motion";
import { X, Sparkles } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/hooks/useAuth";
import { optionKeyFor } from "@/lib/constants/listing-options";
import { isValidGePhone, toLocalGePhone } from "@/lib/utils/number";
import DateField from "@/components/shared/DateField";
import TimeField from "@/components/shared/TimeField";
import NumberField from "@/components/shared/NumberField";
import PhoneInput from "@/components/forms/PhoneInput";
import { toLocalDateKey, type ManualTaskRow } from "@/lib/cleaner/tasks";

const inputClass =
  "w-full rounded-xl border border-[#E2E8F0] bg-white px-4 py-2.5 text-[13px] font-semibold text-[#0F172A] focus:border-[#2563EB] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/10";

interface ManualTaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Non-null puts the modal in edit mode, seeded from this row. */
  task: ManualTaskRow | null;
  initialDate: Date;
  occupiedSlots: OccupiedCleanerSlot[];
  onSaved: (scheduledAt: string) => void;
}

export interface OccupiedCleanerSlot {
  id: string;
  source: "platform" | "manual";
  scheduledAt: string;
}

/** Split a stored timestamptz into the local "YYYY-MM-DD" / "HH:MM" the fields want. */
function splitLocal(iso: string): { date: string; time: string } {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  };
}

export default function ManualTaskModal({
  isOpen,
  onClose,
  task,
  initialDate,
  occupiedSlots,
  onSaved,
}: ManualTaskModalProps) {
  const t = useTranslations("CleanerSchedule.manualTask");
  const tShared = useTranslations("DashboardShared");
  const tOpts = useTranslations("ListingOptions");
  const { user } = useAuth();
  const supabase = createClient();

  const [clientName, setClientName] = useState("");
  const [phone, setPhone] = useState("");
  const [cleaningType, setCleaningType] = useState<"standard" | "general">(
    "standard",
  );
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [price, setPrice] = useState("");
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset (create) or seed (edit) on every open.
  useEffect(() => {
    if (!isOpen) return;
    const when = task
      ? splitLocal(task.scheduled_at)
      : { date: toLocalDateKey(initialDate), time: "" };
    setClientName(task?.client_name ?? "");
    setPhone(toLocalGePhone(task?.client_phone));
    setCleaningType(
      optionKeyFor("cleaningTypes", task?.cleaning_type ?? null) === "general"
        ? "general"
        : "standard",
    );
    setDate(when.date);
    setTime(when.time);
    setPrice(task?.price != null ? String(task.price) : "");
    setAddress(task?.address ?? "");
    setNotes(task?.notes ?? "");
    setError(null);
  }, [initialDate, isOpen, task]);

  useEffect(() => {
    if (!isOpen) return;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [isOpen, onClose]);

  const priceNumber = Number(price.trim());
  const phoneValid = isValidGePhone(phone);
  const selectedScheduledAt = useMemo(() => {
    if (!date || !time) return null;
    const parsed = new Date(`${date}T${time}`);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }, [date, time]);
  const slotConflict = useMemo(() => {
    if (!selectedScheduledAt) return false;
    const selectedMs = new Date(selectedScheduledAt).getTime();

    // Legacy duplicates are preserved. An edit that leaves its original slot
    // unchanged must remain saveable; only moving into an occupied slot fails.
    if (
      task &&
      new Date(task.scheduled_at).getTime() === selectedMs
    ) {
      return false;
    }

    return occupiedSlots.some(
      (slot) => new Date(slot.scheduledAt).getTime() === selectedMs,
    );
  }, [occupiedSlots, selectedScheduledAt, task]);
  const canSubmit =
    clientName.trim() !== "" &&
    phoneValid &&
    date !== "" &&
    time !== "" &&
    address.trim() !== "" &&
    price.trim() !== "" &&
    !Number.isNaN(priceNumber) &&
    !slotConflict;

  const handleSubmit = async () => {
    if (!canSubmit || saving || !user) return;
    setSaving(true);
    setError(null);

    // Local-time parse on purpose: the schedule buckets days with local
    // getFullYear/getMonth/getDate, so the two must agree.
    const payload = {
      client_name: clientName.trim(),
      client_phone: `+995${phone}`,
      address: address.trim(),
      cleaning_type: cleaningType,
      scheduled_at: selectedScheduledAt!,
      price: priceNumber,
      notes: notes.trim() || null,
    };

    const { error: writeError } = task
      ? await supabase
          .from("cleaner_manual_tasks")
          .update(payload)
          .eq("id", task.id)
          .eq("cleaner_id", user.id)
      : await supabase
          .from("cleaner_manual_tasks")
          .insert({ ...payload, cleaner_id: user.id });

    setSaving(false);
    if (writeError) {
      setError(
        writeError.code === "23P01" ||
          writeError.message.includes("cleaner_schedule_slot_conflict")
          ? t("timeConflict")
          : t("saveError"),
      );
      return;
    }
    onSaved(payload.scheduled_at);
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
            className="relative z-10 max-h-[90vh] w-full max-w-[520px] overflow-y-auto rounded-[24px] bg-white p-6 shadow-[0px_24px_60px_-12px_rgba(15,23,42,0.25)]"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#DBEAFE] text-[#2563EB]">
                  <Sparkles className="h-4 w-4" strokeWidth={2.3} />
                </span>
                <div>
                  <h2 className="text-[16px] font-black text-[#0F172A]">
                    {task ? t("editTitle") : t("createTitle")}
                  </h2>
                  <p className="text-[12px] font-semibold text-[#64748B]">
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
                <Field label={t("clientName")}>
                  <input
                    type="text"
                    value={clientName}
                    onChange={(e) => setClientName(e.target.value)}
                    maxLength={120}
                    placeholder={t("clientNamePlaceholder")}
                    className={inputClass}
                  />
                </Field>

                <Field label={tShared("phone")}>
                  <PhoneInput
                    value={phone}
                    onChange={setPhone}
                    error={
                      phone !== "" && !phoneValid
                        ? tShared("invalidPhone")
                        : null
                    }
                  />
                </Field>

                <Field label={t("cleaningType")}>
                  <div className="grid grid-cols-2 gap-2">
                    {(
                      [
                        // value = exact DB payload for cleaning_type
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
                      onChange={(value) => {
                        setDate(value);
                        setError(null);
                      }}
                      className="h-12 lg:h-[42px]"
                    />
                  </Field>
                  <Field label={tShared("time")}>
                    <TimeField
                      value={time}
                      onChange={(value) => {
                        setTime(value);
                        setError(null);
                      }}
                      error={slotConflict || error === t("timeConflict")}
                      className="h-12 lg:h-[42px]"
                    />
                  </Field>
                </div>

                {slotConflict && (
                  <p role="alert" className="text-[12px] font-bold text-[#DC2626]">
                    {t("timeConflict")}
                  </p>
                )}

                <Field label={t("address")}>
                  <input
                    type="text"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    maxLength={300}
                    placeholder={t("addressPlaceholder")}
                    className={inputClass}
                  />
                </Field>

                <Field label={t("price")}>
                  <NumberField
                    value={price}
                    onChange={setPrice}
                    min={0}
                    decimals={2}
                    placeholder="30"
                    suffix="₾"
                  />
                </Field>

                <Field label={tShared("note")}>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={3}
                    maxLength={1000}
                    placeholder={t("notesPlaceholder")}
                    className={`${inputClass} resize-none`}
                  />
                </Field>
              </div>

              {error && (
                <p className="mt-3 rounded-xl bg-[#FEF2F2] px-4 py-2.5 text-[12px] font-bold text-[#EF4444]">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={!canSubmit || saving}
                className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#2563EB] py-3 text-[13px] font-black text-white transition-colors hover:bg-[#1E40AF] disabled:opacity-50"
              >
                {saving
                  ? tShared("saving")
                  : task
                    ? tShared("save")
                    : tShared("add")}
              </button>
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
