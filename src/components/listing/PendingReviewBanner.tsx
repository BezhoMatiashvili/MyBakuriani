"use client";

import { useTranslations } from "next-intl";
import { Info } from "lucide-react";

/**
 * Shown atop a listing detail page when the viewer is previewing a not-yet-approved
 * listing (their own, or — for an admin — any listing). The listing stays hidden from
 * the public until approved; this explains why it renders like a live page but isn't.
 *
 * Visibility is decided server-side in get*ById (only the owner or an admin ever
 * receive a non-active row); this is purely the explanatory notice.
 */
export default function PendingReviewBanner() {
  const t = useTranslations("ListingPreview");
  return (
    <div
      role="status"
      className="mb-6 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3.5 text-amber-900"
    >
      <Info className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
      <div className="min-w-0">
        <p className="text-[14px] font-bold">{t("title")}</p>
        <p className="mt-0.5 text-[13px] leading-relaxed text-amber-800">
          {t("body")}
        </p>
      </div>
    </div>
  );
}
