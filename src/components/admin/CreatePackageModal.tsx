"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import Modal from "@/components/shared/Modal";

export type PackageCategory =
  | "sms"
  | "vip"
  | "verification"
  | "ad"
  | "subscription";

interface CreatePackageModalProps {
  isOpen: boolean;
  onClose: () => void;
  category: PackageCategory;
  categoryLabel: string;
  onCreated: () => void;
}

const VIP_TIERS: { value: string; label: string }[] = [
  { value: "super", label: "Super VIP — საუკეთესო პოზიცია" },
  { value: "standard", label: "VIP სტატუსი — გამოკვეთა" },
  { value: "discount", label: "ფასდაკლების ბეჯი" },
];

export default function CreatePackageModal({
  isOpen,
  onClose,
  category,
  categoryLabel,
  onCreated,
}: CreatePackageModalProps) {
  const [name, setName] = useState("");
  const [label, setLabel] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState<number | "">("");
  const [smsCount, setSmsCount] = useState<number | "">("");
  const [durationHours, setDurationHours] = useState<number | "">(24);
  const [vipTier, setVipTier] = useState<string>("standard");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setName("");
    setLabel("");
    setDescription("");
    setPrice("");
    setSmsCount("");
    setDurationHours(24);
    setVipTier("standard");
  }, [isOpen]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("შეიყვანეთ პაკეტის სახელი");
      return;
    }
    if (price === "" || Number(price) < 0) {
      toast.error("შეიყვანეთ სწორი ფასი");
      return;
    }
    if (category === "sms" && (smsCount === "" || Number(smsCount) <= 0)) {
      toast.error("SMS პაკეტისთვის სავალდებულოა SMS-ების რაოდენობა");
      return;
    }
    if (
      category === "vip" &&
      (durationHours === "" || Number(durationHours) <= 0)
    ) {
      toast.error("VIP-ისთვის სავალდებულოა ხანგრძლივობა");
      return;
    }

    const meta: Record<string, unknown> = {};
    if (category === "sms") {
      meta.sms_count = Number(smsCount);
    } else if (category === "vip") {
      meta.duration_hours = Number(durationHours);
      meta.tier = vipTier;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/pricing-packages", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          category,
          name: name.trim(),
          label: label.trim() || null,
          description: description.trim() || null,
          amount_gel: Number(price),
          meta,
        }),
      });
      const payload = (await res.json().catch(() => null)) as {
        error?: string;
      } | null;
      if (!res.ok) {
        toast.error(payload?.error ?? "შექმნა ვერ მოხერხდა");
        return;
      }
      toast.success("პაკეტი დაემატა");
      onCreated();
      onClose();
    } catch {
      toast.error("შექმნა ვერ მოხერხდა");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`ახალი პაკეტი — ${categoryLabel}`}
      size="md"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <label className="text-[12px] font-bold text-[#0F172A]">
            სახელი <span className="text-[#DC2626]">*</span>
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="მაგ: VIP 48 საათი"
            className="w-full rounded-xl border border-[#E2E8F0] bg-white px-3 py-2.5 text-sm font-medium text-[#0F172A] outline-none focus:border-[#2563EB]"
            autoFocus
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-[12px] font-bold text-[#0F172A]">
            მოკლე ნიშნული (Label)
          </label>
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="მაგ: 48 საათი, 200 SMS, 1 კვირა"
            className="w-full rounded-xl border border-[#E2E8F0] bg-white px-3 py-2.5 text-sm font-medium text-[#0F172A] outline-none focus:border-[#2563EB]"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-[12px] font-bold text-[#0F172A]">
            აღწერა (გამოჩნდება მომხმარებლის ბარათზე)
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            placeholder="აღწერეთ, რას იღებს მომხმარებელი ამ პაკეტიდან"
            className="w-full resize-none rounded-xl border border-[#E2E8F0] bg-white px-3 py-2.5 text-sm font-medium text-[#0F172A] outline-none focus:border-[#2563EB]"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-[12px] font-bold text-[#0F172A]">
            ფასი (₾) <span className="text-[#DC2626]">*</span>
          </label>
          <input
            type="number"
            min={0}
            step={0.01}
            value={price}
            onChange={(e) =>
              setPrice(e.target.value === "" ? "" : Number(e.target.value))
            }
            placeholder="0"
            className="w-full rounded-xl border border-[#E2E8F0] bg-white px-3 py-2.5 text-sm font-bold text-[#0F172A] outline-none focus:border-[#2563EB]"
          />
        </div>

        {category === "sms" ? (
          <div className="space-y-1.5">
            <label className="text-[12px] font-bold text-[#0F172A]">
              SMS-ების რაოდენობა <span className="text-[#DC2626]">*</span>
            </label>
            <input
              type="number"
              min={1}
              step={1}
              value={smsCount}
              onChange={(e) =>
                setSmsCount(e.target.value === "" ? "" : Number(e.target.value))
              }
              placeholder="მაგ: 200"
              className="w-full rounded-xl border border-[#E2E8F0] bg-white px-3 py-2.5 text-sm font-bold text-[#0F172A] outline-none focus:border-[#2563EB]"
            />
          </div>
        ) : null}

        {category === "vip" ? (
          <>
            <div className="space-y-1.5">
              <label className="text-[12px] font-bold text-[#0F172A]">
                ხანგრძლივობა (საათი) <span className="text-[#DC2626]">*</span>
              </label>
              <input
                type="number"
                min={1}
                step={1}
                value={durationHours}
                onChange={(e) =>
                  setDurationHours(
                    e.target.value === "" ? "" : Number(e.target.value),
                  )
                }
                className="w-full rounded-xl border border-[#E2E8F0] bg-white px-3 py-2.5 text-sm font-bold text-[#0F172A] outline-none focus:border-[#2563EB]"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[12px] font-bold text-[#0F172A]">
                VIP ტიპი
              </label>
              <select
                value={vipTier}
                onChange={(e) => setVipTier(e.target.value)}
                className="w-full rounded-xl border border-[#E2E8F0] bg-white px-3 py-2.5 text-sm font-medium text-[#0F172A] outline-none focus:border-[#2563EB]"
              >
                {VIP_TIERS.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
          </>
        ) : null}

        <div className="flex gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="flex-1 rounded-xl border border-[#E2E8F0] bg-white px-4 py-3 text-sm font-bold text-[#0F172A] hover:bg-[#F8FAFC] disabled:opacity-50"
          >
            გაუქმება
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#2563EB] px-4 py-3 text-sm font-bold text-white hover:bg-[#1E40AF] disabled:opacity-50"
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                იქმნება...
              </>
            ) : (
              "შექმნა"
            )}
          </button>
        </div>
      </form>
    </Modal>
  );
}
