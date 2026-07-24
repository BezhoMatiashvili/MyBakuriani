"use client";

import Image from "next/image";
import Link from "next/link";
import { useTranslations } from "next-intl";
import Modal from "@/components/shared/Modal";
import { BANNER_TONE_STYLES, type LandingBanner } from "@/lib/banners";
import { safeInternalPath, safeHttpsUrl } from "@/lib/security";

interface BannerDetailModalProps {
  banner: LandingBanner | null;
  onClose: () => void;
}

function formatDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("ka-GE", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function BannerDetailModal({
  banner,
  onClose,
}: BannerDetailModalProps) {
  const t = useTranslations("Shared");

  if (!banner) return null;

  const tone = BANNER_TONE_STYLES[banner.tone];
  const ctaHref =
    safeInternalPath(banner.cta_href) ?? safeHttpsUrl(banner.cta_href);

  return (
    <Modal isOpen onClose={onClose} title={banner.title} size="lg">
      <div className="space-y-4">
        {banner.video_url ? (
          <video
            src={banner.video_url}
            poster={banner.video_poster_url ?? banner.image_url ?? undefined}
            controls
            className="w-full rounded-2xl"
          />
        ) : banner.image_url ? (
          <div className="relative aspect-[16/9] w-full overflow-hidden rounded-2xl">
            <Image
              src={banner.image_url}
              alt=""
              fill
              sizes="(max-width: 640px) 100vw, 512px"
              className="object-cover"
            />
          </div>
        ) : null}

        {banner.body ? (
          <p
            className="text-[14px] font-medium leading-[22px]"
            style={{ color: tone.text }}
          >
            {banner.body}
          </p>
        ) : null}

        {banner.start_at || banner.end_at ? (
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-[13px] font-medium text-[#64748B]">
            {banner.start_at ? (
              <span>
                {t("bannerValidFrom")}: {formatDate(banner.start_at)}
              </span>
            ) : null}
            {banner.end_at ? (
              <span>
                {t("bannerValidUntil")}: {formatDate(banner.end_at)}
              </span>
            ) : null}
          </div>
        ) : null}

        {banner.cta_label && ctaHref ? (
          <Link
            href={ctaHref}
            className="flex w-full items-center justify-center rounded-full border-2 bg-white px-6 py-3 text-[14px] font-bold transition-colors"
            style={{ borderColor: tone.ctaText, color: tone.ctaText }}
          >
            {banner.cta_label}
          </Link>
        ) : null}
      </div>
    </Modal>
  );
}
