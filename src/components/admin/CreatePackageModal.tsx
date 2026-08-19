"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import DateField from "@/components/shared/DateField";
import Modal from "@/components/shared/Modal";
import NumberField from "@/components/shared/NumberField";

export type PackageCategory =
  | "sms"
  | "vip"
  | "verification"
  | "ad"
  | "subscription";

export interface EditPackage {
  id: string;
  category: PackageCategory;
  name: string;
  label: string | null;
  description: string | null;
  amount_gel: number;
  meta: Record<string, unknown> | null;
}

interface CreatePackageModalProps {
  isOpen: boolean;
  onClose: () => void;
  category: PackageCategory;
  categoryLabel: string;
  onCreated: () => void;
  // When provided, the modal edits this package (PATCH) instead of creating one.
  editPackage?: EditPackage | null;
}

const VIP_TIER_VALUES = ["super", "standard", "discount"] as const;

export default function CreatePackageModal({
  isOpen,
  onClose,
  category,
  categoryLabel,
  onCreated,
  editPackage,
}: CreatePackageModalProps) {
  const t = useTranslations("AdminShared.createPackage");
  const tAdmin = useTranslations("AdminShared");
  const tShared = useTranslations("DashboardShared");

  const isEdit = Boolean(editPackage);
  // In edit mode the category is fixed to the package's own category.
  const effectiveCategory = editPackage?.category ?? category;

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
    if (editPackage) {
      const meta = (editPackage.meta ?? {}) as Record<string, unknown>;
      setName(editPackage.name ?? "");
      setLabel(editPackage.label ?? "");
      setDescription(editPackage.description ?? "");
      setPrice(
        typeof editPackage.amount_gel === "number"
          ? editPackage.amount_gel
          : "",
      );
      setSmsCount(
        typeof meta.sms_count === "number" ? (meta.sms_count as number) : "",
      );
      setDurationHours(
        typeof meta.duration_hours === "number"
          ? (meta.duration_hours as number)
          : 24,
      );
      setVipTier(
        typeof meta.tier === "string" ? (meta.tier as string) : "standard",
      );
      setValidFrom(
        typeof meta.valid_from === "string" ? (meta.valid_from as string) : "",
      );
      setValidTo(
        typeof meta.valid_to === "string" ? (meta.valid_to as string) : "",
      );
    } else {
      setName("");
      setLabel("");
      setDescription("");
      setPrice("");
      setSmsCount("");
      setDurationHours(24);
      setVipTier("standard");
      setValidFrom("");
      setValidTo("");
    }
  }, [isOpen, editPackage]);

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
    if (
      effectiveCategory === "sms" &&
      (smsCount === "" || Number(smsCount) <= 0)
    ) {
      toast.error(t("smsRequired"));
      return;
    }
    if (
      effectiveCategory === "vip" &&
      (durationHours === "" || Number(durationHours) <= 0)
    ) {
      toast.error(t("vipDurationRequired"));
      return;
    }
    const isRenterMembership =
      effectiveCategory === "subscription" &&
      (editPackage?.meta?.subscription_scope === "renter" || !editPackage);
    if (effectiveCategory === "subscription" && !isRenterMembership) {
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

    // Preserve every metadata field we do not explicitly manage in this form.
    const meta: Record<string, unknown> = { ...(editPackage?.meta ?? {}) };
    if (effectiveCategory === "sms") {
      meta.sms_count = Number(smsCount);
    } else if (effectiveCategory === "vip") {
      meta.duration_hours = Number(durationHours);
      meta.tier = vipTier;
    } else if (effectiveCategory === "subscription" && isRenterMembership) {
      meta.subscription_scope = "renter";
      meta.billing_period = "seasonal";
      meta.season_end_month = 3;
      meta.season_end_day = 15;
      delete meta.duration_months;
      delete meta.valid_from;
      delete meta.valid_to;
    } else if (effectiveCategory === "subscription") {
      // Validity period the buyer receives (read by purchase_package RPC)
      meta.valid_from = validFrom;
      meta.valid_to = validTo;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/pricing-packages", {
        method: isEdit ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(
          isEdit
            ? {
                id: editPackage!.id,
                name: name.trim(),
                label: label.trim() || null,
                description: description.trim() || null,
                amount_gel: Number(price),
                meta,
              }
            : {
                category: effectiveCategory,
                name: name.trim(),
                label: label.trim() || null,
                description: description.trim() || null,
                amount_gel: Number(price),
                meta,
              },
        ),
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
            : (payload?.error ??
                (isEdit ? t("updateFailed") : tAdmin("createFailed"))),
        );
        return;
      }
      toast.success(isEdit ? t("packageUpdated") : t("packageAdded"));
      onCreated();
      onClose();
    } catch {
      toast.error(isEdit ? t("updateFailed") : tAdmin("createFailed"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t(isEdit ? "editTitle" : "title", { label: categoryLabel })}
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
          <NumberField
            value={price === "" ? "" : String(price)}
            onChange={(v) => setPrice(v === "" ? "" : Number(v))}
            min={0}
            max={100000}
            decimals={2}
            suffix="₾"
            placeholder="0"
          />
        </div>

        {effectiveCategory === "sms" ? (
          <div className="space-y-1.5">
            <label className="text-[12px] font-bold text-[#0F172A]">
              {t("smsCount")} <span className="text-[#DC2626]">*</span>
            </label>
            <NumberField
              value={smsCount === "" ? "" : String(smsCount)}
              onChange={(v) => setSmsCount(v === "" ? "" : Number(v))}
              integer
              min={1}
              max={10000}
              placeholder={t("smsPlaceholder")}
            />
          </div>
        ) : null}

        {effectiveCategory === "subscription" &&
        (editPackage?.meta?.subscription_scope === "renter" || !editPackage) ? (
          <div className="space-y-1.5">
            <label className="text-[12px] font-bold text-[#0F172A]">
              {t("membershipDuration")}
            </label>
            <p className="rounded-xl border border-[#BFDBFE] bg-[#EFF6FF] px-3 py-2.5 text-sm font-semibold text-[#1D4ED8]">
              {t("seasonalMembership")}
            </p>
          </div>
        ) : effectiveCategory === "subscription" ? (
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-[12px] font-bold text-[#0F172A]">
                {t("validFrom")} <span className="text-[#DC2626]">*</span>
              </label>
              <DateField
                value={validFrom}
                onChange={setValidFrom}
                className="h-[42px]"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[12px] font-bold text-[#0F172A]">
                {t("validTo")} <span className="text-[#DC2626]">*</span>
              </label>
              <DateField
                value={validTo}
                min={validFrom || undefined}
                onChange={setValidTo}
                className="h-[42px]"
              />
            </div>
          </div>
        ) : null}

        {effectiveCategory === "vip" ? (
          <>
            <div className="space-y-1.5">
              <label className="text-[12px] font-bold text-[#0F172A]">
                {t("durationHours")} <span className="text-[#DC2626]">*</span>
              </label>
              <NumberField
                value={durationHours === "" ? "" : String(durationHours)}
                onChange={(v) => setDurationHours(v === "" ? "" : Number(v))}
                integer
                min={1}
                max={8760}
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
                {isEdit ? t("saving") : t("creating")}
              </>
            ) : isEdit ? (
              t("save")
            ) : (
              t("create")
            )}
          </button>
        </div>
      </form>
    </Modal>
  );
}
