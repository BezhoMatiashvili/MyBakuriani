"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { X } from "lucide-react";
import { useTranslations } from "next-intl";
import BannerDetailModal from "@/components/shared/BannerDetailModal";
import { BANNER_TONE_STYLES, type LandingBanner } from "@/lib/banners";

const DISMISS_KEY = "mybakuriani:sticky_news:dismissed";

export function StickyNewsBar() {
  const t = useTranslations("Shared");
  const pathname = usePathname();
  // Detail pages render MobileStickyCTA (fixed bottom-0, md:hidden) — below md
  // the news bar must stack above it instead of covering the primary CTA.
  const isDetailRoute =
    /\/(apartments|hotels|sales|food|services|entertainment|transport|employment)\/[^/]+$/.test(
      pathname ?? "",
    ) && !/\/sales\/all$/.test(pathname ?? "");
  // Transport detail uses TransportContactFooter (fixed at all breakpoints, not
  // md:hidden), so the news bar must clear it on desktop too.
  const isTransportDetail = /\/transport\/[^/]+$/.test(pathname ?? "");
  const [banners, setBanners] = useState<LandingBanner[]>([]);
  const [dismissedIds, setDismissedIds] = useState<string[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [expanded, setExpanded] = useState<LandingBanner | null>(null);

  useEffect(() => {
    setHydrated(true);
    try {
      const raw = window.localStorage.getItem(DISMISS_KEY);
      if (raw) setDismissedIds(JSON.parse(raw) as string[]);
    } catch {
      // ignore
    }

    let cancelled = false;
    fetch("/api/banners?kind=sticky_news", { cache: "no-store" })
      .then((r) => r.json())
      .then((payload) => {
        if (cancelled) return;
        if (Array.isArray(payload.banners)) {
          setBanners(payload.banners as LandingBanner[]);
        }
      })
      .catch(() => {
        // silent — non-critical UI
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!hydrated) return null;

  const visible = banners.find((b) => !dismissedIds.includes(b.id));
  if (!visible) return null;

  const tone = BANNER_TONE_STYLES[visible.tone];

  function dismiss(id: string) {
    const next = Array.from(new Set([...dismissedIds, id]));
    setDismissedIds(next);
    try {
      window.localStorage.setItem(DISMISS_KEY, JSON.stringify(next));
    } catch {
      // ignore
    }
  }

  return (
    <div
      className={`pointer-events-none fixed inset-x-0 z-40 flex justify-center px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:pb-4 ${
        isTransportDetail
          ? "bottom-[calc(76px+env(safe-area-inset-bottom))]"
          : isDetailRoute
            ? "bottom-[calc(76px+env(safe-area-inset-bottom))] md:bottom-0"
            : "bottom-0"
      }`}
    >
      <div
        role="button"
        tabIndex={0}
        onClick={() => setExpanded(visible)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") setExpanded(visible);
        }}
        className="pointer-events-auto flex w-full max-w-[1160px] cursor-pointer flex-wrap items-center justify-between gap-3 rounded-2xl border px-4 py-3 shadow-[0px_8px_24px_-8px_rgba(15,23,42,0.25)] sm:px-5"
        style={{ backgroundColor: tone.bg, borderColor: tone.border }}
      >
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <span
            aria-hidden
            className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full text-[13px] font-black"
            style={{ backgroundColor: tone.iconBg, color: tone.iconText }}
          >
            !
          </span>
          <p
            className="min-w-0 text-[13px] font-medium leading-[20px]"
            style={{ color: tone.text }}
          >
            <span className="font-bold" style={{ color: tone.title }}>
              {visible.title}
            </span>
            {visible.body ? <> — {visible.body}</> : null}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {visible.cta_label && visible.cta_href ? (
            <Link
              href={visible.cta_href}
              onClick={(e) => e.stopPropagation()}
              className="rounded-full border bg-white px-4 py-2 text-[12px] font-bold transition-colors"
              style={{ borderColor: tone.ctaBorder, color: tone.ctaText }}
            >
              {visible.cta_label}
            </Link>
          ) : null}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              dismiss(visible.id);
            }}
            aria-label={t("close")}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border bg-white"
            style={{ borderColor: tone.ctaBorder, color: tone.text }}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
      <BannerDetailModal banner={expanded} onClose={() => setExpanded(null)} />
    </div>
  );
}
