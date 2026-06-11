"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import Image from "next/image";
import { Check, UserPlus } from "lucide-react";
import Modal from "@/components/shared/Modal";
import { formatPrice } from "@/lib/utils/format";
import type { Database } from "@/lib/types/database";

type PlatformCleaner =
  Database["public"]["Functions"]["get_platform_cleaners"]["Returns"][number];

interface AddCleanerModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Already deduped to one entry per cleaner by the page. */
  cleaners: PlatformCleaner[];
  loading: boolean;
  savedIds: Set<string>;
  /** Resolves false when the write failed (state already rolled back). */
  onToggle: (cleanerId: string, save: boolean) => Promise<boolean>;
}

function deriveInitials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word.charAt(0))
    .join(".");
}

export default function AddCleanerModal({
  isOpen,
  onClose,
  cleaners,
  loading,
  savedIds,
  onToggle,
}: AddCleanerModalProps) {
  const t = useTranslations("RenterCleaners");
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState(false);

  async function handleToggle(cleaner: PlatformCleaner) {
    const id = cleaner.cleaner_id;
    setError(false);
    setPendingIds((prev) => new Set(prev).add(id));
    try {
      const ok = await onToggle(id, !savedIds.has(id));
      if (!ok) setError(true);
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
      {error && (
        <p className="mb-3 rounded-xl bg-[#FEF2F2] px-4 py-2.5 text-[12px] font-bold text-[#EF4444]">
          {t("addModal.error")}
        </p>
      )}

      {loading ? (
        <ul className="space-y-2">
          {[0, 1, 2].map((i) => (
            <li
              key={i}
              className="h-[68px] animate-pulse rounded-2xl border border-[#EEF1F4] bg-[#F8FAFC]"
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
        <ul className="space-y-2">
          {cleaners.map((cleaner) => {
            const isSaved = savedIds.has(cleaner.cleaner_id);
            const isPending = pendingIds.has(cleaner.cleaner_id);
            return (
              <li
                key={cleaner.cleaner_id}
                className="flex items-center gap-3 rounded-2xl border border-[#EEF1F4] bg-white p-3"
              >
                {cleaner.avatar_url ? (
                  <span className="relative block h-10 w-10 shrink-0 overflow-hidden rounded-full">
                    <Image
                      src={cleaner.avatar_url}
                      alt=""
                      fill
                      sizes="40px"
                      className="object-cover"
                    />
                  </span>
                ) : (
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#DBEAFE] text-[12px] font-extrabold text-[#2563EB]">
                    {deriveInitials(cleaner.name)}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] font-extrabold text-[#0F172A]">
                    {cleaner.name}
                  </p>
                  <p className="truncate text-[12px] font-medium text-[#64748B]">
                    {cleaner.phone}
                    {cleaner.phone && cleaner.price != null && " · "}
                    {cleaner.price != null &&
                      formatPrice(Number(cleaner.price))}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => handleToggle(cleaner)}
                  aria-pressed={isSaved}
                  className={`inline-flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-full px-4 text-[12px] font-bold transition-colors disabled:opacity-60 ${
                    isSaved
                      ? "border border-[#E2E8F0] bg-white text-[#16A34A] hover:border-[#EF4444] hover:text-[#EF4444]"
                      : "bg-[#0F172A] text-white hover:bg-[#1E293B]"
                  }`}
                >
                  {isSaved ? (
                    <Check className="h-4 w-4" strokeWidth={2.4} />
                  ) : (
                    <UserPlus className="h-4 w-4" strokeWidth={2.4} />
                  )}
                  {isSaved ? t("addModal.added") : t("addModal.add")}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Modal>
  );
}
