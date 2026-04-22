"use client";

import { useState } from "react";
import Modal from "@/components/shared/Modal";

export type LeadStage =
  | "new"
  | "contacted"
  | "shown"
  | "negotiating"
  | "closed";

export type LeadPriority = "low" | "medium" | "high";

export interface LeadInput {
  client_name: string;
  client_phone?: string;
  property_id?: string | null;
  stage: LeadStage;
  priority: LeadPriority;
  budget_min?: number | null;
  budget_max?: number | null;
}

interface AddLeadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (lead: LeadInput) => Promise<void> | void;
  properties: { id: string; title: string }[];
}

const STAGE_OPTIONS: { value: LeadStage; label: string }[] = [
  { value: "new", label: "ახალი მოთხოვნა" },
  { value: "contacted", label: "დავუკავშირდი" },
  { value: "shown", label: "ვაჩვენე ობიექტი" },
  { value: "negotiating", label: "მოლაპარაკება" },
  { value: "closed", label: "გაფორმდა" },
];

const PRIORITY_OPTIONS: {
  value: LeadPriority;
  label: string;
  activeClass: string;
  idleClass: string;
}[] = [
  {
    value: "low",
    label: "დაბალი",
    activeClass: "border-[#2563EB] bg-[#EFF6FF] text-[#2563EB]",
    idleClass: "border-[#E2E8F0] bg-white text-[#64748B]",
  },
  {
    value: "medium",
    label: "საშ.",
    activeClass: "border-[#F97316] bg-[#FFF7ED] text-[#F97316]",
    idleClass: "border-[#E2E8F0] bg-white text-[#64748B]",
  },
  {
    value: "high",
    label: "მაღალი",
    activeClass: "border-[#EF4444] bg-[#FEF2F2] text-[#EF4444]",
    idleClass: "border-[#E2E8F0] bg-white text-[#64748B]",
  },
];

export default function AddLeadModal({
  isOpen,
  onClose,
  onSubmit,
  properties,
}: AddLeadModalProps) {
  const [clientName, setClientName] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [propertyId, setPropertyId] = useState<string>("");
  const [stage, setStage] = useState<LeadStage>("new");
  const [priority, setPriority] = useState<LeadPriority>("medium");
  const [budgetMin, setBudgetMin] = useState("");
  const [budgetMax, setBudgetMax] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setClientName("");
    setClientPhone("");
    setPropertyId("");
    setStage("new");
    setPriority("medium");
    setBudgetMin("");
    setBudgetMax("");
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!clientName.trim()) {
      setError("სახელი სავალდებულოა");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit({
        client_name: clientName.trim(),
        client_phone: clientPhone.trim() || undefined,
        property_id: propertyId || null,
        stage,
        priority,
        budget_min: budgetMin ? Number(budgetMin) : null,
        budget_max: budgetMax ? Number(budgetMax) : null,
      });
      reset();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "შეცდომა. სცადეთ თავიდან.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => {
        reset();
        onClose();
      }}
      title="ახალი მოთხოვნის დამატება"
      size="md"
    >
      <p className="-mt-2 mb-5 text-[12px] text-[#64748B]">
        მოსავდებათ მეშვეობით CRM-ში
      </p>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-[12px] font-bold text-[#0F172A]">
              კლიენტის სახელი *
            </label>
            <input
              type="text"
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
              placeholder="მაგ: დავითი"
              className="h-11 w-full rounded-xl border border-[#E2E8F0] bg-white px-4 text-[13px] focus:border-[#2563EB] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/10"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-[12px] font-bold text-[#0F172A]">
              ტელეფონის ნომერი
            </label>
            <input
              type="tel"
              value={clientPhone}
              onChange={(e) => setClientPhone(e.target.value)}
              placeholder="+995"
              className="h-11 w-full rounded-xl border border-[#E2E8F0] bg-white px-4 text-[13px] focus:border-[#2563EB] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/10"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-[12px] font-bold text-[#0F172A]">
              რომელი დაინტერესებულია *
            </label>
            <select
              value={propertyId}
              onChange={(e) => setPropertyId(e.target.value)}
              className="h-11 w-full rounded-xl border border-[#E2E8F0] bg-white px-4 text-[13px] focus:border-[#2563EB] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/10"
            >
              <option value="">— აირჩიეთ ობიექტი —</option>
              {properties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-[12px] font-bold text-[#0F172A]">
              სტატუსი (ეტაპი)
            </label>
            <select
              value={stage}
              onChange={(e) => setStage(e.target.value as LeadStage)}
              className="h-11 w-full rounded-xl border border-[#E2E8F0] bg-white px-4 text-[13px] focus:border-[#2563EB] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/10"
            >
              {STAGE_OPTIONS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="mb-1.5 block text-[12px] font-bold text-[#0F172A]">
            სავარაუდო ბიუჯეტი (USD)
          </label>
          <div className="flex gap-3">
            <div className="relative flex-1">
              <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[13px] text-[#94A3B8]">
                $
              </span>
              <input
                type="number"
                inputMode="numeric"
                value={budgetMin}
                onChange={(e) => setBudgetMin(e.target.value)}
                placeholder="მინ. 25,000"
                className="h-11 w-full rounded-xl border border-[#E2E8F0] bg-white pl-7 pr-4 text-[13px] focus:border-[#2563EB] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/10"
              />
            </div>
            <div className="relative flex-1">
              <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[13px] text-[#94A3B8]">
                $
              </span>
              <input
                type="number"
                inputMode="numeric"
                value={budgetMax}
                onChange={(e) => setBudgetMax(e.target.value)}
                placeholder="მაქს. 50,000"
                className="h-11 w-full rounded-xl border border-[#E2E8F0] bg-white pl-7 pr-4 text-[13px] focus:border-[#2563EB] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/10"
              />
            </div>
          </div>
        </div>

        <div>
          <label className="mb-1.5 block text-[12px] font-bold text-[#0F172A]">
            პრიორიტეტი
          </label>
          <div className="flex gap-2">
            {PRIORITY_OPTIONS.map((p) => {
              const active = priority === p.value;
              return (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => setPriority(p.value)}
                  className={`flex-1 rounded-xl border px-4 py-2.5 text-[12px] font-bold transition-colors ${
                    active ? p.activeClass : p.idleClass
                  }`}
                >
                  {p.label}
                </button>
              );
            })}
          </div>
        </div>

        {error && (
          <p className="rounded-lg bg-[#FEF2F2] px-3 py-2 text-[12px] font-semibold text-[#B91C1C]">
            {error}
          </p>
        )}

        <div className="flex items-center justify-between gap-3 pt-2">
          <button
            type="button"
            onClick={() => {
              reset();
              onClose();
            }}
            className="rounded-xl px-5 py-2.5 text-[13px] font-bold text-[#64748B] hover:bg-[#F8FAFC]"
          >
            გაუქმება
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="rounded-xl bg-[#2563EB] px-6 py-2.5 text-[13px] font-bold text-white shadow-[0_6px_14px_-4px_rgba(37,99,235,0.35)] transition-colors hover:bg-[#1D4ED8] disabled:opacity-60"
          >
            {submitting ? "..." : "დამატება"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
