"use client";

import { useState } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import {
  AlertCircle,
  Check,
  Eye,
  MapPin,
  RefreshCw,
  UserPlus,
} from "lucide-react";
import Modal from "@/components/shared/Modal";
import { formatPrice } from "@/lib/utils/format";
import type { PlatformCleanerProfile } from "@/components/renter/CleanerDetailModal";

interface AddCleanerModalProps {
  isOpen: boolean;
  onClose: () => void;
  cleaners: PlatformCleanerProfile[];
  loading: boolean;
  detailsError: boolean;
  savedIds: Set<string>;
  onToggle: (cleanerId: string, save: boolean) => Promise<boolean>;
  onCreateOwn: () => void;
  onViewDetails: (cleaner: PlatformCleanerProfile) => void;
  onRetry: () => void;
}

function deriveInitials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word.charAt(0))
    .join(".");
}

function coverageFor(cleaner: PlatformCleanerProfile): string | null {
  const zones = Array.from(
    new Set(
      cleaner.services.flatMap((service) =>
        (service.location ?? "")
          .split(",")
          .map((zone) => zone.trim())
          .filter(Boolean),
      ),
    ),
  );
  return zones.length ? zones.join(", ") : null;
}

export default function AddCleanerModal({
  isOpen,
  onClose,
  cleaners,
  loading,
  detailsError,
  savedIds,
  onToggle,
  onCreateOwn,
  onViewDetails,
  onRetry,
}: AddCleanerModalProps) {
  const t = useTranslations("RenterCleaners");
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const [saveError, setSaveError] = useState(false);

  async function handleToggle(cleaner: PlatformCleanerProfile) {
    const id = cleaner.id;
    setSaveError(false);
    setPendingIds((prev) => new Set(prev).add(id));
    try {
      const ok = await onToggle(id, !savedIds.has(id));
      if (!ok) setSaveError(true);
    } finally {
      setPendingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t("addModal.title")}>
      {saveError && (
        <p className="mb-3 rounded-xl bg-[#FEF2F2] px-4 py-2.5 text-[12px] font-bold text-[#EF4444]">
          {t("addModal.error")}
        </p>
      )}

      <button
        type="button"
        onClick={onCreateOwn}
        className="mb-3 inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-[#CBD5E1] bg-[#F8FAFC] px-4 text-[13px] font-bold text-[#0F172A] transition-colors hover:border-[#2563EB] hover:text-[#2563EB]"
      >
        <UserPlus className="h-4 w-4" strokeWidth={2.4} />
        {t("addModal.createOwn")}
      </button>

      <p className="mb-3 rounded-xl bg-[#EFF6FF] px-3 py-2.5 text-[11px] font-semibold leading-4 text-[#1D4ED8]">
        {t("addModal.approvalNote")}
      </p>

      {detailsError && (
        <div className="mb-3 flex items-center gap-3 rounded-2xl border border-[#FECACA] bg-[#FEF2F2] p-3">
          <AlertCircle className="size-4 shrink-0 text-[#DC2626]" />
          <p className="min-w-0 flex-1 text-[12px] font-bold text-[#991B1B]">
            {t("detailsLoadError")}
          </p>
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-white px-3 text-[12px] font-bold text-[#0F172A]"
          >
            <RefreshCw className="size-3.5" />
            {t("retry")}
          </button>
        </div>
      )}

      {loading ? (
        <ul className="space-y-2">
          {[0, 1, 2].map((i) => (
            <li
              key={i}
              className="h-[132px] animate-pulse rounded-2xl border border-[#EEF1F4] bg-[#F8FAFC]"
            />
          ))}
        </ul>
      ) : cleaners.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[#E2E8F0] bg-white px-6 py-10 text-center">
          <p className="text-sm font-medium text-[#64748B]">
            {t("noCleanersAvailable")}
          </p>
        </div>
      ) : (
        <ul className="max-h-[55dvh] space-y-3 overflow-y-auto pr-1">
          {cleaners.map((cleaner) => {
            const isSaved = savedIds.has(cleaner.id);
            const isPending = pendingIds.has(cleaner.id);
            const coverage = coverageFor(cleaner);
            const photo = cleaner.avatarUrl ?? cleaner.services[0]?.photoUrl;
            const prices = cleaner.services
              .map((service) => service.price)
              .filter((price): price is number => price != null);
            const minPrice = prices.length ? Math.min(...prices) : null;
            return (
              <li
                key={cleaner.id}
                className="rounded-2xl border border-[#EEF1F4] bg-white p-4"
              >
                <div className="flex items-start gap-3">
                  {photo ? (
                    <span className="relative block h-11 w-11 shrink-0 overflow-hidden rounded-full bg-[#F1F5F9]">
                      <Image
                        src={photo}
                        alt=""
                        fill
                        sizes="44px"
                        className="object-cover"
                      />
                    </span>
                  ) : (
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#DBEAFE] text-[12px] font-extrabold text-[#2563EB]">
                      {deriveInitials(cleaner.name)}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-[14px] font-extrabold text-[#0F172A]">
                        {cleaner.name}
                      </p>
                      <span className="rounded-full bg-[#EFF6FF] px-2 py-0.5 text-[10px] font-bold text-[#2563EB]">
                        {t("sourcePlatform")}
                      </span>
                    </div>
                    {coverage && (
                      <p className="mt-1 flex items-start gap-1 text-[11px] font-semibold leading-4 text-[#64748B]">
                        <MapPin className="mt-0.5 size-3 shrink-0" />
                        <span className="line-clamp-1">{coverage}</span>
                      </p>
                    )}
                    <p className="mt-1 line-clamp-2 text-[12px] font-semibold leading-4 text-[#334155]">
                      {cleaner.services
                        .slice(0, 2)
                        .map((service) => service.title)
                        .join(" · ")}
                      {cleaner.services.length > 2 &&
                        ` · ${t("moreServices", { count: cleaner.services.length - 2 })}`}
                    </p>
                    {minPrice != null && (
                      <p className="mt-1 text-[12px] font-black text-[#0F172A]">
                        {t("priceFrom", { price: formatPrice(minPrice) })}
                      </p>
                    )}
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => onViewDetails(cleaner)}
                    className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-[#E2E8F0] bg-white px-3 text-[12px] font-bold text-[#0F172A] transition-colors hover:border-[#2563EB] hover:text-[#2563EB]"
                  >
                    <Eye className="size-4" />
                    {t("details")}
                  </button>
                  <button
                    type="button"
                    disabled={isPending || detailsError}
                    onClick={() => handleToggle(cleaner)}
                    aria-pressed={isSaved}
                    className={`inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl px-3 text-[12px] font-bold transition-colors disabled:opacity-60 ${
                      isSaved
                        ? "border border-[#E2E8F0] bg-white text-[#16A34A] hover:border-[#EF4444] hover:text-[#EF4444]"
                        : "bg-[#0F172A] text-white hover:bg-[#1E293B]"
                    }`}
                  >
                    {isSaved ? (
                      <Check className="size-4" strokeWidth={2.4} />
                    ) : (
                      <UserPlus className="size-4" strokeWidth={2.4} />
                    )}
                    {isSaved ? t("addModal.added") : t("addModal.add")}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Modal>
  );
}
