"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, Check, Flame, UserPlus, X } from "lucide-react";
import { useTranslations } from "next-intl";
import PhoneInput from "@/components/forms/PhoneInput";
import {
  LEAD_STAGE_VALUES,
  type LeadStageValue,
} from "@/lib/supabase/leads";
import { isValidGePhone, toLocalGePhone } from "@/lib/utils/number";

export type LeadStage = LeadStageValue;

export type LeadPriority = "low" | "medium" | "high";

export type LeadInterestType =
  "apartment_purchase" | "cottage_purchase" | "land_plot" | "long_term_rent";

export type LeadLocation = "didveli" | "koxta" | "centri" | "tyis_piras";

export interface LeadInput {
  client_name: string;
  client_phone?: string;
  stage: LeadStage;
  priority: LeadPriority;
  budget_min?: number | null;
  budget_max?: number | null;
  interest_type?: LeadInterestType | null;
  desired_location?: LeadLocation | null;
  note?: string | null;
}

// Narrow, modal-owned shape used to pre-fill the form in edit mode. Keeps the
// modal decoupled from the board's wider Lead type (source, currency, etc.).
export interface LeadEditInitial {
  id: string;
  client_name: string;
  client_phone: string | null;
  stage: LeadStage;
  priority: LeadPriority;
  budget_min: number | null;
  budget_max: number | null;
  interest_type: LeadInterestType | null;
  desired_location: LeadLocation | null;
  note: string | null;
}

interface AddLeadModalProps {
  isOpen: boolean;
  onClose: () => void;
  mode?: "create" | "edit";
  initialLead?: LeadEditInitial | null;
  onSubmit: (lead: LeadInput) => Promise<void> | void;
}

const INTEREST_VALUES: LeadInterestType[] = [
  "apartment_purchase",
  "cottage_purchase",
  "land_plot",
  "long_term_rent",
];

const LOCATION_VALUES: LeadLocation[] = [
  "didveli",
  "koxta",
  "centri",
  "tyis_piras",
];

interface CustomSelectProps<T extends string> {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}

function CustomSelect<T extends string>({
  value,
  options,
  onChange,
}: CustomSelectProps<T>) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node))
        setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const selected = options.find((o) => o.value === value);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`flex h-12 w-full items-center justify-between rounded-xl border-2 bg-white px-4 text-[14px] font-bold text-[#0F172A] transition-colors ${
          open ? "border-[#2563EB]" : "border-[#E2E8F0] hover:border-[#CBD5E1]"
        }`}
      >
        <span>{selected?.label}</span>
        <ChevronDown
          className={`h-4 w-4 text-[#94A3B8] transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      <AnimatePresence>
        {open && (
          <motion.ul
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.12 }}
            className="absolute left-0 right-0 top-full z-20 mt-2 overflow-hidden rounded-xl border border-[#E2E8F0] bg-white py-1 shadow-[0_12px_28px_-8px_rgba(15,23,42,0.18)]"
          >
            {options.map((o) => {
              const active = o.value === value;
              return (
                <li key={o.value}>
                  <button
                    type="button"
                    onClick={() => {
                      onChange(o.value);
                      setOpen(false);
                    }}
                    className={`flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left text-[13px] transition-colors ${
                      active
                        ? "bg-[#EFF6FF] font-bold text-[#2563EB]"
                        : "text-[#0F172A] hover:bg-[#F8FAFC]"
                    }`}
                  >
                    <span>{o.label}</span>
                    {active && <Check className="h-4 w-4 text-[#2563EB]" />}
                  </button>
                </li>
              );
            })}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}

function parseBudget(input: string): {
  min: number | null;
  max: number | null;
} {
  const nums = input
    .replace(/[^\d\s.,-]/g, " ")
    .split(/[\s,–\-]+/)
    .map((s) => s.replace(/\./g, "").trim())
    .filter(Boolean)
    .map(Number)
    .filter((n) => Number.isFinite(n));
  if (nums.length === 0) return { min: null, max: null };
  if (nums.length === 1) return { min: nums[0], max: nums[0] };
  return { min: Math.min(nums[0], nums[1]), max: Math.max(nums[0], nums[1]) };
}

// Inverse of parseBudget — reconstructs the free-text budget field from stored
// min/max. Plain numbers (no separators) so re-saving yields the same min/max.
function formatBudgetText(min: number | null, max: number | null): string {
  if (min == null && max == null) return "";
  if (min != null && max != null) {
    return min === max ? String(min) : `${min} - ${max}`;
  }
  return String(min ?? max);
}

export default function AddLeadModal({
  isOpen,
  onClose,
  mode = "create",
  initialLead,
  onSubmit,
}: AddLeadModalProps) {
  const t = useTranslations("SellerDashboard.addLead");
  const tStages = useTranslations("SellerDashboard.salesBoard.stages");
  const tShared = useTranslations("DashboardShared");

  const interestOptions = useMemo(
    () =>
      INTEREST_VALUES.map((value) => ({
        value,
        label: t(`interests.${value}`),
      })),
    [t],
  );

  const stageOptions = useMemo(
    () =>
      LEAD_STAGE_VALUES.map((value) => ({
        value,
        label: tStages(value),
      })),
    [tStages],
  );

  const locationOptions = useMemo(
    () =>
      LOCATION_VALUES.map((value) => ({
        value,
        label: t(`locations.${value}`),
      })),
    [t],
  );

  const [clientName, setClientName] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [interest, setInterest] =
    useState<LeadInterestType>("apartment_purchase");
  const [stage, setStage] = useState<LeadStage>("new");
  const [budgetText, setBudgetText] = useState("");
  const [priority, setPriority] = useState<LeadPriority>("medium");
  const [location, setLocation] = useState<LeadLocation | null>(null);
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
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
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  function reset() {
    setClientName("");
    setClientPhone("");
    setInterest("apartment_purchase");
    setStage("new");
    setBudgetText("");
    setPriority("medium");
    setLocation(null);
    setNote("");
    setError(null);
  }

  // Seed the form on open: pre-fill from the lead in edit mode, reset otherwise.
  // Keyed on initialLead too so switching between leads while open re-seeds.
  useEffect(() => {
    if (!isOpen) return;
    if (mode === "edit" && initialLead) {
      setClientName(initialLead.client_name ?? "");
      setClientPhone(toLocalGePhone(initialLead.client_phone));
      setInterest(initialLead.interest_type ?? "apartment_purchase");
      setStage(initialLead.stage);
      setBudgetText(
        formatBudgetText(initialLead.budget_min, initialLead.budget_max),
      );
      setPriority(initialLead.priority);
      setLocation(initialLead.desired_location ?? null);
      setNote(initialLead.note ?? "");
      setError(null);
    } else {
      reset();
    }
  }, [isOpen, mode, initialLead]);

  function handleClose() {
    reset();
    onClose();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!clientName.trim()) {
      setError(t("nameRequired"));
      return;
    }
    if (clientPhone && !isValidGePhone(clientPhone)) return;
    setSubmitting(true);
    setError(null);
    try {
      const { min, max } = parseBudget(budgetText);

      // In edit mode, only overwrite budget / interest when the seller actually
      // changed that input. Otherwise pass the stored value straight through, so
      // a save never silently rewrites data the lossy text round-trip can't
      // reproduce (decimal or one-sided budgets, a null interest on legacy rows).
      const budgetUntouched =
        mode === "edit" &&
        initialLead != null &&
        budgetText ===
          formatBudgetText(initialLead.budget_min, initialLead.budget_max);
      const interestUntouched =
        mode === "edit" &&
        initialLead != null &&
        interest === (initialLead.interest_type ?? "apartment_purchase");

      await onSubmit({
        client_name: clientName.trim(),
        client_phone: clientPhone ? "+995" + clientPhone : undefined,
        stage,
        priority,
        budget_min:
          budgetUntouched && initialLead ? initialLead.budget_min : min,
        budget_max:
          budgetUntouched && initialLead ? initialLead.budget_max : max,
        interest_type:
          interestUntouched && initialLead
            ? initialLead.interest_type
            : interest,
        desired_location: location,
        note: note.trim() || null,
      });
      reset();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : tShared("genericRetry"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/50"
            onClick={handleClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 12 }}
            transition={{ duration: 0.2 }}
            className="relative z-10 flex max-h-[92vh] w-full max-w-[640px] flex-col overflow-hidden rounded-t-2xl bg-white shadow-[0_24px_60px_-16px_rgba(15,23,42,0.22)] sm:rounded-2xl"
          >
            <div className="h-1 w-full bg-gradient-to-r from-[#2563EB] via-[#3B82F6] to-[#2563EB]" />

            <div className="flex items-start justify-between gap-4 px-7 pt-6 pb-5">
              <div className="flex items-start gap-3.5">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#EFF6FF]">
                  <UserPlus className="h-5 w-5 text-[#2563EB]" />
                </div>
                <div>
                  <h2 className="text-[20px] font-black leading-tight text-[#0F172A]">
                    {mode === "edit" ? t("editTitle") : t("title")}
                  </h2>
                  <p className="mt-1 text-[12px] font-semibold uppercase tracking-wide text-[#94A3B8]">
                    {mode === "edit" ? t("editSubtitle") : t("subtitle")}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleClose}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#E2E8F0] text-[#64748B] hover:bg-[#F8FAFC]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form
              onSubmit={handleSubmit}
              className="flex-1 overflow-y-auto px-7 pb-2"
            >
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-[12px] font-bold text-[#0F172A]">
                    {t("clientName")}
                  </label>
                  <input
                    type="text"
                    value={clientName}
                    onChange={(e) => setClientName(e.target.value)}
                    placeholder={t("clientNamePlaceholder")}
                    className="h-12 w-full rounded-xl border-2 border-[#E2E8F0] bg-white px-4 text-[14px] focus:border-[#2563EB] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-[12px] font-bold text-[#0F172A]">
                    {t("phoneLabel")}
                  </label>
                  <PhoneInput
                    value={clientPhone}
                    onChange={setClientPhone}
                    error={
                      clientPhone && !isValidGePhone(clientPhone)
                        ? tShared("invalidPhone")
                        : null
                    }
                  />
                </div>
              </div>

              <div className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-[12px] font-bold text-[#0F172A]">
                    {t("interestLabel")}
                  </label>
                  <CustomSelect
                    value={interest}
                    options={interestOptions}
                    onChange={setInterest}
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-[12px] font-bold text-[#0F172A]">
                    {t("stageLabel")}
                  </label>
                  <CustomSelect
                    value={stage}
                    options={stageOptions}
                    onChange={setStage}
                  />
                </div>
              </div>

              <div className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-[12px] font-bold text-[#0F172A]">
                    {t("budgetLabel")}
                  </label>
                  <div className="relative">
                    <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[14px] font-bold text-[#94A3B8]">
                      $
                    </span>
                    <input
                      type="text"
                      value={budgetText}
                      onChange={(e) => setBudgetText(e.target.value)}
                      placeholder={t("budgetPlaceholder")}
                      className="h-12 w-full rounded-xl border-2 border-[#E2E8F0] bg-white pl-9 pr-4 text-[14px] focus:border-[#2563EB] focus:outline-none"
                    />
                  </div>
                </div>
                <div>
                  <label className="mb-1.5 block text-[12px] font-bold text-[#0F172A]">
                    {t("priorityLabel")}
                  </label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setPriority("low")}
                      className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl border-2 px-3 py-2.5 text-[12px] font-bold transition-colors ${
                        priority === "low"
                          ? "border-[#94A3B8] bg-[#F1F5F9] text-[#475569]"
                          : "border-[#E2E8F0] bg-white text-[#64748B]"
                      }`}
                    >
                      <span className="h-1.5 w-1.5 rounded-full bg-[#94A3B8]" />
                      {t("priorityLow")}
                    </button>
                    <button
                      type="button"
                      onClick={() => setPriority("medium")}
                      className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl border-2 px-3 py-2.5 text-[12px] font-bold transition-colors ${
                        priority === "medium"
                          ? "border-[#F59E0B] bg-[#FFFBEB] text-[#A16207]"
                          : "border-[#E2E8F0] bg-white text-[#64748B]"
                      }`}
                    >
                      <span className="h-1.5 w-1.5 rounded-full bg-[#F59E0B]" />
                      {t("priorityMedium")}
                    </button>
                    <button
                      type="button"
                      onClick={() => setPriority("high")}
                      className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl border-2 px-3 py-2.5 text-[12px] font-bold transition-colors ${
                        priority === "high"
                          ? "border-[#F97316] bg-[#F0FDF4] text-[#EA580C]"
                          : "border-[#E2E8F0] bg-white text-[#64748B]"
                      }`}
                    >
                      <Flame
                        className={`h-3.5 w-3.5 ${priority === "high" ? "text-[#F97316]" : "text-[#94A3B8]"}`}
                      />
                      {t("priorityHigh")}
                    </button>
                  </div>
                </div>
              </div>

              <div className="mt-5">
                <label className="mb-1.5 block text-[12px] font-bold text-[#0F172A]">
                  {t("locationLabel")}
                </label>
                <div className="flex flex-wrap gap-2">
                  {locationOptions.map((l) => {
                    const active = location === l.value;
                    return (
                      <button
                        key={l.value}
                        type="button"
                        onClick={() => setLocation(active ? null : l.value)}
                        className={`rounded-xl border-2 px-5 py-2.5 text-[13px] font-bold transition-colors ${
                          active
                            ? "border-[#2563EB] bg-[#2563EB] text-white"
                            : "border-[#E2E8F0] bg-white text-[#64748B] hover:border-[#CBD5E1]"
                        }`}
                      >
                        {l.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="mt-5">
                <label className="mb-1.5 block text-[12px] font-bold text-[#0F172A]">
                  {t("noteLabel")}
                </label>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={4}
                  placeholder={t("notePlaceholder")}
                  className="w-full rounded-xl border-2 border-[#E2E8F0] bg-white px-4 py-3 text-[13px] focus:border-[#2563EB] focus:outline-none"
                />
              </div>

              {error && (
                <p className="mt-4 rounded-lg bg-[#FEF2F2] px-3 py-2 text-[12px] font-semibold text-[#B91C1C]">
                  {error}
                </p>
              )}
            </form>

            <div className="flex items-center justify-between gap-3 border-t border-[#E2E8F0] bg-[#F8FAFC] px-7 pt-4 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:pb-4">
              <button
                type="button"
                onClick={handleClose}
                className="rounded-xl border-2 border-[#E2E8F0] bg-white px-6 py-2.5 text-[13px] font-bold text-[#475569] hover:bg-[#F1F5F9]"
              >
                {tShared("cancel")}
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={
                  submitting || (!!clientPhone && !isValidGePhone(clientPhone))
                }
                className="rounded-xl bg-[#2563EB] px-7 py-2.5 text-[13px] font-bold text-white shadow-[0_8px_18px_-6px_rgba(37,99,235,0.45)] transition-colors hover:bg-[#1D4ED8] disabled:opacity-60"
              >
                {submitting
                  ? tShared("inProgress")
                  : mode === "edit"
                    ? tShared("saveChanges")
                    : tShared("add")}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
