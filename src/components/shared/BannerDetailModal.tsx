"use client";

import Image from "next/image";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import Modal from "@/components/shared/Modal";
import {
  getTonePalette,
  sponsoredLabel,
  type BannerCreative,
} from "@/lib/banner-creative";

interface BannerDetailModalProps {
  creative: BannerCreative | null;
  onClose: () => void;
}

function formatDate(iso: string | null, locale: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString(locale === "ka" ? "ka-GE" : locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function BannerDetailModal({
  creative,
  onClose,
}: BannerDetailModalProps) {
  const t = useTranslations("Shared");
  const locale = useLocale();

  if (!creative) return null;

  const tone = getTonePalette(creative.tone);

  return (
    <Modal isOpen onClose={onClose} title={creative.title} size="lg">
      <div className="space-y-4">
        {/* Reachable for ads since the media creatives grew an expand button —
            the advertising disclosure is not optional on any ad surface. */}
        {creative.sponsored ? (
          <span
            data-sponsored="true"
            className="inline-block rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.5px] text-white/95"
            style={{ backgroundColor: tone.badgeBg }}
          >
            {sponsoredLabel(locale)}
          </span>
        ) : null}

        {creative.videoUrl ? (
          <video
            src={creative.videoUrl}
            poster={creative.videoPosterUrl ?? creative.imageUrl ?? undefined}
            controls
            className="w-full rounded-2xl"
          />
        ) : creative.imageUrl ? (
          <div className="relative aspect-[16/9] w-full overflow-hidden rounded-2xl">
            <Image
              src={creative.imageUrl}
              alt=""
              fill
              sizes="(max-width: 640px) 100vw, 512px"
              className="object-cover"
            />
          </div>
        ) : null}

        {creative.body ? (
          <p
            className="text-[14px] font-medium leading-[22px]"
            style={{ color: tone.text }}
          >
            {creative.body}
          </p>
        ) : null}

        {/* Editorial only: on an ad these dates are the campaign flight window,
            which is advertiser data and not public. */}
        {!creative.sponsored && (creative.startAt || creative.endAt) ? (
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-[13px] font-medium text-[#64748B]">
            {creative.startAt ? (
              <span>
                {t("bannerValidFrom")}: {formatDate(creative.startAt, locale)}
              </span>
            ) : null}
            {creative.endAt ? (
              <span>
                {t("bannerValidUntil")}: {formatDate(creative.endAt, locale)}
              </span>
            ) : null}
          </div>
        ) : null}

        {creative.ctaLabel && creative.href ? (
          <Link
            href={creative.href}
            className="flex w-full items-center justify-center rounded-full border-2 bg-white px-6 py-3 text-[14px] font-bold transition-colors"
            style={{ borderColor: tone.ctaText, color: tone.ctaText }}
          >
            {creative.ctaLabel}
          </Link>
        ) : null}
      </div>
    </Modal>
  );
}
