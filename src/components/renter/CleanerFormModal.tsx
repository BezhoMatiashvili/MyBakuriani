"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Clock3, X, UserPlus } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/hooks/useAuth";
import { useActiveZones } from "@/lib/zones/client";
import NumberField from "@/components/shared/NumberField";
import PhoneInput from "@/components/forms/PhoneInput";
import TimeRangePicker, {
  isValidTimeRange,
} from "@/components/shared/TimeRangePicker";
import { isValidGePhone, toLocalGePhone } from "@/lib/utils/number";
import type { Tables } from "@/lib/types/database";

interface CleanerFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
  cleaner?: Tables<"renter_cleaners"> | null;
}

const LANGUAGES = ["ქართული", "ინგლისური", "რუსული"] as const;

export default function CleanerFormModal({
  isOpen,
  onClose,
  onSaved,
  cleaner,
}: CleanerFormModalProps) {
  const t = useTranslations("RenterDashboard.modals.cleanerForm");
  const tShared = useTranslations("DashboardShared");
  const tOpts = useTranslations("ListingOptions");
  const { user } = useAuth();
  const supabase = useMemo(() => createClient(), []);
  const { zones } = useActiveZones();

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [priceStandard, setPriceStandard] = useState("");
  const [priceGeneral, setPriceGeneral] = useState("");
  const [available, setAvailable] = useState(true);
  const [selectedZones, setSelectedZones] = useState<string[]>([]);
  const [description, setDescription] = useState("");
  const [experienceYears, setExperienceYears] = useState("");
  const [languages, setLanguages] = useState<string[]>([]);
  const [schedule, setSchedule] = useState("");
  const [is247, setIs247] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setName(cleaner?.name ?? "");
    setPhone(toLocalGePhone(cleaner?.phone));
    setPriceStandard(
      cleaner?.price_standard != null ? String(cleaner.price_standard) : "",
    );
    setPriceGeneral(
      cleaner?.price_general != null ? String(cleaner.price_general) : "",
    );
    setAvailable(cleaner?.available ?? true);
    setSelectedZones(
      (cleaner?.location ?? "")
        .split(",")
        .map((zone) => zone.trim())
        .filter(Boolean),
    );
    setDescription(cleaner?.description ?? "");
    setExperienceYears(
      cleaner?.experience_years != null
        ? String(cleaner.experience_years)
        : "",
    );
    setLanguages(cleaner?.languages ?? []);
    setIs247(cleaner?.schedule === "24/7");
    setSchedule(cleaner?.schedule === "24/7" ? "" : cleaner?.schedule ?? "");
    setError(null);
  }, [isOpen, cleaner]);

  useEffect(() => {
    if (isOpen) {
      const previousOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = previousOverflow;
      };
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const h = (event: KeyboardEvent) =>
      event.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [isOpen, onClose]);

  const zoneOptions = useMemo(() => {
    const active = zones.map((zone) => zone.name_ka);
    const legacy = selectedZones.filter((zone) => !active.includes(zone));
    return [...active, ...legacy];
  }, [zones, selectedZones]);

  function toggleItem(
    value: string,
    setter: React.Dispatch<React.SetStateAction<string[]>>,
  ) {
    setter((current) =>
      current.includes(value)
        ? current.filter((item) => item !== value)
        : [...current, value],
    );
  }

  const toNumberOrNull = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const number = Number(trimmed);
    return Number.isNaN(number) ? null : number;
  };

  const handleSubmit = async () => {
    if (saving) return;
    if (!name.trim()) {
      setError(t("enterName"));
      return;
    }
    if (selectedZones.length === 0) {
      setError(t("chooseLocation"));
      return;
    }
    if (!description.trim()) {
      setError(t("enterDescription"));
      return;
    }
    if (phone && !isValidGePhone(phone)) {
      setError(tShared("invalidPhone"));
      return;
    }
    if (schedule && !is247 && !isValidTimeRange(schedule)) {
      setError(t("invalidSchedule"));
      return;
    }

    setSaving(true);
    setError(null);
    const payload = {
      name: name.trim(),
      phone: phone ? `+995${phone}` : null,
      price_standard: toNumberOrNull(priceStandard),
      price_general: toNumberOrNull(priceGeneral),
      available,
      location: selectedZones.join(", "),
      description: description.trim(),
      experience_years: toNumberOrNull(experienceYears),
      languages: languages.length ? languages : null,
      schedule: is247 ? "24/7" : schedule.trim() || null,
    };

    try {
      const result = cleaner
        ? await supabase
            .from("renter_cleaners")
            .update(payload)
            .eq("id", cleaner.id)
        : user
          ? await supabase
              .from("renter_cleaners")
              .insert({ owner_id: user.id, ...payload })
          : null;
      if (!result || result.error) throw result?.error ?? new Error("no_user");
      onSaved();
      onClose();
    } catch {
      setError(tShared("genericRetry"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center sm:p-4">
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
            role="dialog"
            aria-modal="true"
            aria-labelledby="cleaner-form-title"
            className="relative z-10 max-h-[92dvh] w-full max-w-[620px] overflow-y-auto rounded-t-[24px] bg-white p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-[0px_24px_60px_-12px_rgba(15,23,42,0.25)] sm:rounded-[24px] sm:p-6"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#DBEAFE] text-[#2563EB]">
                  <UserPlus className="h-4 w-4" strokeWidth={2.3} />
                </span>
                <div>
                  <h2
                    id="cleaner-form-title"
                    className="text-[16px] font-black text-[#0F172A]"
                  >
                    {cleaner ? t("editTitle") : t("newTitle")}
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
                className="flex h-11 w-11 items-center justify-center rounded-full text-[#94A3B8] hover:bg-[#F1F5F9]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form
              onSubmit={(event) => {
                event.preventDefault();
                void handleSubmit();
              }}
              noValidate
            >
              <div className="mt-5 space-y-4">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Field label={tShared("name")} required>
                    <input
                      type="text"
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                      placeholder={t("namePlaceholder")}
                      className={inputClass}
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
                </div>

                <Field label={t("location")} required>
                  <div className="flex flex-wrap gap-2">
                    {zoneOptions.map((zone) => (
                      <Chip
                        key={zone}
                        selected={selectedZones.includes(zone)}
                        onClick={() => toggleItem(zone, setSelectedZones)}
                      >
                        {zone}
                      </Chip>
                    ))}
                  </div>
                </Field>

                <Field label={t("description")} required>
                  <textarea
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    rows={4}
                    placeholder={t("descriptionPlaceholder")}
                    className={`${inputClass} resize-none`}
                  />
                </Field>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Field label={t("experience")}>
                    <NumberField
                      value={experienceYears}
                      onChange={setExperienceYears}
                      min={0}
                      max={60}
                      integer
                      suffix={t("yearsSuffix")}
                      placeholder="5"
                    />
                  </Field>
                  <Field label={t("languages")}>
                    <div className="flex min-h-11 flex-wrap gap-2">
                      {LANGUAGES.map((language) => {
                        const key =
                          language === "ქართული"
                            ? "ka"
                            : language === "ინგლისური"
                              ? "en"
                              : "ru";
                        return (
                          <Chip
                            key={language}
                            selected={languages.includes(language)}
                            onClick={() => toggleItem(language, setLanguages)}
                          >
                            {tOpts(`languages.${key}`)}
                          </Chip>
                        );
                      })}
                    </div>
                  </Field>
                </div>

                <Field label={t("workingHours")}>
                  <div className="space-y-2">
                    <TimeRangePicker
                      value={schedule}
                      onChange={setSchedule}
                      disabled={is247}
                    />
                    <button
                      type="button"
                      aria-pressed={is247}
                      onClick={() => setIs247((current) => !current)}
                      className={`inline-flex min-h-11 items-center gap-2 rounded-xl border px-4 text-[12px] font-bold transition-colors ${
                        is247
                          ? "border-[#86EFAC] bg-[#F0FDF4] text-[#15803D]"
                          : "border-[#E2E8F0] bg-white text-[#64748B]"
                      }`}
                    >
                      <Clock3 className="size-4" />
                      {t("mode247")}
                    </button>
                  </div>
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

                <button
                  type="button"
                  role="switch"
                  aria-checked={available}
                  onClick={() => setAvailable((current) => !current)}
                  className="flex min-h-11 w-full items-center justify-between rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-4 text-left"
                >
                  <span className="text-[13px] font-bold text-[#0F172A]">
                    {t("available")}
                  </span>
                  <span
                    className={`flex h-6 w-11 items-center rounded-full p-0.5 transition-colors ${available ? "bg-[#16A34A]" : "bg-[#CBD5E1]"}`}
                  >
                    <span
                      className={`flex size-5 items-center justify-center rounded-full bg-white transition-transform ${available ? "translate-x-5" : "translate-x-0"}`}
                    >
                      {available && <Check className="size-3 text-[#16A34A]" />}
                    </span>
                  </span>
                </button>
              </div>

              {error && (
                <p className="mt-4 rounded-xl bg-[#FEF2F2] px-4 py-2.5 text-[12px] font-bold text-[#DC2626]">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={saving}
                className="mt-5 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#2563EB] px-5 text-[13px] font-black text-white transition-colors hover:bg-[#1E40AF] disabled:opacity-50"
              >
                {saving ? tShared("saving") : tShared("save")}
              </button>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

const inputClass =
  "w-full rounded-xl border border-[#E2E8F0] bg-white px-4 py-2.5 text-[13px] font-semibold text-[#0F172A] outline-none focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/10";

function Field({
  label,
  required = false,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wide text-[#94A3B8]">
        {label}
        {required && <span className="ml-1 text-[#EF4444]">*</span>}
      </label>
      {children}
    </div>
  );
}

function Chip({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={`inline-flex min-h-11 items-center gap-1.5 rounded-full border px-3 text-[12px] font-bold transition-colors ${
        selected
          ? "border-[#93C5FD] bg-[#EFF6FF] text-[#2563EB]"
          : "border-[#E2E8F0] bg-white text-[#64748B]"
      }`}
    >
      {selected && <Check className="size-3.5" />}
      {children}
    </button>
  );
}
