"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
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

const VIP_TIER_VALUES = ["super", "standard", "discount"] as const;

export default function CreatePackageModal({
  isOpen,
  onClose,
  category,
  categoryLabel,
  onCreated,
}: CreatePackageModalProps) {
  const t = useTranslations("AdminShared.createPackage");
  const tAdmin = useTranslations("AdminShared");
  const tShared = useTranslations("DashboardShared");

  const vipTiers = useMemo(
    () =>
      VIP_TIER_VALUES.map((value) => ({
        value,
        label: t(`vipTiers.${value}`),
      })),
    [t],
  );

  const [name, setName] = useState("");
  const [label, setLabel] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState<number | "">("");
  const [smsCount, setSmsCount] = useState<number | "">("");
  const [durationHours, setDurationHours] = useState<number | "">(24);
  const [vipTier, setVipTier] = useState<string>("standard");
  const [validFrom, setValidFrom] = useState("");
  const [validTo, setValidTo] = useState("");
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
    setValidFrom("");
    setValidTo("");
  }, [isOpen]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      toast.error(t("nameRequired"));
      return;
    }
    if (price === "" || Number(price) < 0) {
      toast.error(t("priceRequired"));
      return;
    }
    if (category === "sms" && (smsCount === "" || Number(smsCount) <= 0)) {
      toast.error(t("smsRequired"));
      return;
    }
    if (
      category === "vip" &&
      (durationHours === "" || Number(durationHours) <= 0)
    ) {
      toast.error(t("vipDurationRequired"));
      return;
    }
    if (category === "subscription") {
      if (!validFrom || !validTo) {
        toast.error(t("periodRequired"));
        return;
      }
      // ISO YYYY-MM-DD strings compare correctly as strings
      if (validFrom >= validTo) {
        toast.error(t("periodInvalid"));
        return;
      }
    }

    const meta: Record<string, unknown> = {};
    if (category === "sms") {
      meta.sms_count = Number(smsCount);
    } else if (category === "vip") {
      meta.duration_hours = Number(durationHours);
      meta.tier = vipTier;
    } else if (category === "subscription") {
      // Validity period the buyer receives (read by purchase_package RPC)
      meta.valid_from = validFrom;
      meta.valid_to = validTo;
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
        code?: string;
      } | null;
      if (!res.ok) {
        const code = payload?.code;
        toast.error(
          code && tAdmin.has(`apiErrors.${code}`)
            ? tAdmin(`apiErrors.${code}`)
            : (payload?.error ?? tAdmin("createFailed")),
        );
        return;
      }
      toast.success(t("packageAdded"));
      onCreated();
      onClose();
    } catch {
      toast.error(tAdmin("createFailed"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t("title", { label: categoryLabel })}
      size="md"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <label className="text-[12px] font-bold text-[#0F172A]">
            {t("name")} <span className="text-[#DC2626]">*</span>
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("namePlaceholder")}
            className="w-full rounded-xl border border-[#E2E8F0] bg-white px-3 py-2.5 text-sm font-medium text-[#0F172A] outline-none focus:border-[#2563EB]"
            autoFocus
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-[12px] font-bold text-[#0F172A]">
            {t("shortLabel")}
          </label>
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder={t("labelPlaceholder")}
            className="w-full rounded-xl border border-[#E2E8F0] bg-white px-3 py-2.5 text-sm font-medium text-[#0F172A] outline-none focus:border-[#2563EB]"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-[12px] font-bold text-[#0F172A]">
            {t("description")}
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            placeholder={t("descriptionPlaceholder")}
            className="w-full resize-none rounded-xl border border-[#E2E8F0] bg-white px-3 py-2.5 text-sm font-medium text-[#0F172A] outline-none focus:border-[#2563EB]"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-[12px] font-bold text-[#0F172A]">
            {t("price")} <span className="text-[#DC2626]">*</span>
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
              {t("smsCount")} <span className="text-[#DC2626]">*</span>
            </label>
            <input
              type="number"
              min={1}
              step={1}
              value={smsCount}
              onChange={(e) =>
                setSmsCount(e.target.value === "" ? "" : Number(e.target.value))
              }
              placeholder={t("smsPlaceholder")}
              className="w-full rounded-xl border border-[#E2E8F0] bg-white px-3 py-2.5 text-sm font-bold text-[#0F172A] outline-none focus:border-[#2563EB]"
            />
          </div>
        ) : null}

        {category === "subscription" ? (
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-[12px] font-bold text-[#0F172A]">
                {t("validFrom")} <span className="text-[#DC2626]">*</span>
              </label>
              <input
                type="date"
                value={validFrom}
                onChange={(e) => setValidFrom(e.target.value)}
                className="w-full rounded-xl border border-[#E2E8F0] bg-white px-3 py-2.5 text-sm font-medium text-[#0F172A] outline-none focus:border-[#2563EB]"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[12px] font-bold text-[#0F172A]">
                {t("validTo")} <span className="text-[#DC2626]">*</span>
              </label>
              <input
                type="date"
                value={validTo}
                min={validFrom || undefined}
                onChange={(e) => setValidTo(e.target.value)}
                className="w-full rounded-xl border border-[#E2E8F0] bg-white px-3 py-2.5 text-sm font-medium text-[#0F172A] outline-none focus:border-[#2563EB]"
              />
            </div>
          </div>
        ) : null}

        {category === "vip" ? (
          <>
            <div className="space-y-1.5">
              <label className="text-[12px] font-bold text-[#0F172A]">
                {t("durationHours")} <span className="text-[#DC2626]">*</span>
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
                {t("vipType")}
              </label>
              <select
                value={vipTier}
                onChange={(e) => setVipTier(e.target.value)}
                className="w-full rounded-xl border border-[#E2E8F0] bg-white px-3 py-2.5 text-sm font-medium text-[#0F172A] outline-none focus:border-[#2563EB]"
              >
                {vipTiers.map((tier) => (
                  <option key={tier.value} value={tier.value}>
                    {tier.label}
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
            {tShared("cancel")}
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#2563EB] px-4 py-3 text-sm font-bold text-white hover:bg-[#1E40AF] disabled:opacity-50"
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                {t("creating")}
              </>
            ) : (
              t("create")
            )}
          </button>
        </div>
      </form>
    </Modal>
  );
}
