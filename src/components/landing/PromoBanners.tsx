import Image from "next/image";
import Link from "next/link";
import ScrollReveal from "@/components/shared/ScrollReveal";
import { BANNER_TONE_STYLES, type LandingBanner } from "@/lib/banners";

interface PromoBannersProps {
  banners: LandingBanner[];
}

export function PromoBanners({ banners }: PromoBannersProps) {
  if (banners.length === 0) return null;
  return (
    <section className="px-4 pb-8 pt-4">
      <div className="mx-auto max-w-[1160px] space-y-4">
        {banners.map((banner) => {
          const tone = BANNER_TONE_STYLES[banner.tone];
          return (
            <ScrollReveal key={banner.id}>
              <div
                className="relative flex flex-col overflow-hidden rounded-[24px] border shadow-[0px_1px_3px_rgba(0,0,0,0.04)] md:h-[180px] md:flex-row"
                style={{ backgroundColor: tone.bg, borderColor: tone.border }}
              >
                {banner.video_url ? (
                  <div className="relative h-[180px] w-full shrink-0 md:w-[320px]">
                    <video
                      src={banner.video_url}
                      poster={
                        banner.video_poster_url ?? banner.image_url ?? undefined
                      }
                      autoPlay
                      loop
                      muted
                      playsInline
                      className="h-full w-full object-cover"
                    />
                    <span
                      className="absolute left-4 top-4 rounded-md px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-white"
                      style={{ backgroundColor: tone.badgeBg }}
                    >
                      PROMO
                    </span>
                  </div>
                ) : banner.image_url ? (
                  <div className="relative h-[180px] w-full shrink-0 md:w-[320px]">
                    <Image
                      src={banner.image_url}
                      alt=""
                      fill
                      sizes="(max-width: 768px) 100vw, 320px"
                      className="object-cover"
                    />
                    <span
                      className="absolute left-4 top-4 rounded-md px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-white"
                      style={{ backgroundColor: tone.badgeBg }}
                    >
                      PROMO
                    </span>
                  </div>
                ) : null}
                <div className="flex flex-1 flex-col items-start justify-center gap-3 px-6 py-6 md:flex-row md:items-center md:justify-between md:px-10">
                  <div className="max-w-[520px]">
                    <h3
                      className="text-[22px] font-black leading-[28px]"
                      style={{ color: tone.title }}
                    >
                      {banner.title}
                    </h3>
                    {banner.body ? (
                      <p
                        className="mt-2 text-[13px] font-medium leading-[20px]"
                        style={{ color: tone.text }}
                      >
                        {banner.body}
                      </p>
                    ) : null}
                  </div>
                  {banner.cta_label && banner.cta_href ? (
                    <Link
                      href={banner.cta_href}
                      className="shrink-0 rounded-full border-2 bg-white px-6 py-3 text-[13px] font-bold transition-colors"
                      style={{
                        borderColor: tone.ctaText,
                        color: tone.ctaText,
                      }}
                    >
                      {banner.cta_label}
                    </Link>
                  ) : null}
                </div>
              </div>
            </ScrollReveal>
          );
        })}
      </div>
    </section>
  );
}
