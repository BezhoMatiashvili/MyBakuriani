"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { X } from "lucide-react";
import { BANNER_TONE_STYLES, type LandingBanner } from "@/lib/banners";

const DISMISS_KEY = "mybakuriani:sticky_news:dismissed";

export function StickyNewsBar() {
  const [banners, setBanners] = useState<LandingBanner[]>([]);
  const [dismissedIds, setDismissedIds] = useState<string[]>([]);
  const [hydrated, setHydrated] = useState(false);

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
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-3 pb-3 sm:pb-4">
      <div
        className="pointer-events-auto flex w-full max-w-[1160px] flex-wrap items-center justify-between gap-3 rounded-2xl border px-4 py-3 shadow-[0px_8px_24px_-8px_rgba(15,23,42,0.25)] sm:px-5"
        style={{ backgroundColor: tone.bg, borderColor: tone.border }}
        role="status"
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
              className="rounded-full border bg-white px-4 py-2 text-[12px] font-bold transition-colors"
              style={{ borderColor: tone.ctaBorder, color: tone.ctaText }}
            >
              {visible.cta_label}
            </Link>
          ) : null}
          <button
            type="button"
            onClick={() => dismiss(visible.id)}
            aria-label="დახურვა"
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border bg-white"
            style={{ borderColor: tone.ctaBorder, color: tone.text }}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
