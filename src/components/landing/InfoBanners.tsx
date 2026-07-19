"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import BannerDetailModal from "@/components/shared/BannerDetailModal";
import { BANNER_TONE_STYLES, type LandingBanner } from "@/lib/banners";

interface InfoBannersProps {
  banners: LandingBanner[];
}

export function InfoBanners({ banners }: InfoBannersProps) {
  const [expanded, setExpanded] = useState<LandingBanner | null>(null);
  if (banners.length === 0) return null;
  return (
    <div className="mx-auto mt-[70px] w-full max-w-[1160px] space-y-3 px-4 sm:mt-[84px]">
      {banners.map((banner) => {
        const tone = BANNER_TONE_STYLES[banner.tone];
        return (
          <div
            key={banner.id}
            role="button"
            tabIndex={0}
            onClick={() => setExpanded(banner)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") setExpanded(banner);
            }}
            className="flex cursor-pointer flex-col items-start gap-3 rounded-2xl border px-5 py-4 sm:flex-row sm:items-center sm:justify-between"
            style={{ backgroundColor: tone.bg, borderColor: tone.border }}
          >
            <div className="flex items-start gap-3">
              {banner.image_url ? (
                <div className="relative size-10 shrink-0 overflow-hidden rounded-lg">
                  <Image
                    src={banner.image_url}
                    alt=""
                    fill
                    sizes="40px"
                    className="object-cover"
                  />
                </div>
              ) : (
                <span
                  aria-hidden
                  className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full text-[13px] font-black"
                  style={{ backgroundColor: tone.iconBg, color: tone.iconText }}
                >
                  i
                </span>
              )}
              <p
                className="text-[13px] font-medium leading-[20px]"
                style={{ color: tone.text }}
              >
                <span className="font-bold" style={{ color: tone.title }}>
                  {banner.title}
                </span>
                {banner.body ? <> — {banner.body}</> : null}
              </p>
            </div>
            {banner.cta_label && banner.cta_href ? (
              <Link
                href={banner.cta_href}
                onClick={(e) => e.stopPropagation()}
                className="shrink-0 rounded-full border bg-white px-4 py-2 text-[12px] font-bold transition-colors"
                style={{
                  borderColor: tone.ctaBorder,
                  color: tone.ctaText,
                }}
              >
                {banner.cta_label}
              </Link>
            ) : null}
          </div>
        );
      })}
      <BannerDetailModal banner={expanded} onClose={() => setExpanded(null)} />
    </div>
  );
}
