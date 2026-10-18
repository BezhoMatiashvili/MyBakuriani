"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { useLocale } from "next-intl";
import { X } from "lucide-react";
import {
  endAdPreview,
  startAdPreview,
  useAdPreview,
} from "@/lib/ad-preview-client";

/**
 * The admin's on-site ad preview (C47, 2026-10-11): starts it from the URL
 * hash, brings the previewed slot into view once per page and offers to end
 * it. Visible only while a preview runs, i.e. only to an admin (the preview
 * route answers nobody else). Its copy is a literal map, like the "რეკლამა"
 * disclosure, so this public component adds no message namespace.
 */
const LABELS: Record<string, { title: string; close: string }> = {
  ka: { title: "რეკლამის გადახედვა", close: "დახურვა" },
  en: { title: "Ad preview", close: "Close" },
  ru: { title: "Предпросмотр рекламы", close: "Закрыть" },
};

export default function AdPreviewBar() {
  const preview = useAdPreview();
  const pathname = usePathname();
  const labels = LABELS[useLocale()] ?? LABELS.ka;
  const previewId = preview?.id ?? null;

  useEffect(() => {
    startAdPreview();
  }, []);

  // The slot draws once its data has arrived, so look for it for a while.
  useEffect(() => {
    if (!previewId) return;
    let tries = 0;
    const timer = window.setInterval(() => {
      const slot = document.querySelector<HTMLElement>("[data-ad-preview]");
      if (slot) slot.scrollIntoView({ block: "center" });
      if (slot || ++tries >= 20) window.clearInterval(timer);
    }, 250);
    return () => window.clearInterval(timer);
  }, [previewId, pathname]);

  if (!preview) return null;

  return (
    <div
      role="status"
      data-testid="ad-preview-bar"
      className="pointer-events-none fixed inset-x-0 top-3 z-[60] flex justify-center px-3"
    >
      <div className="pointer-events-auto flex min-w-0 max-w-[560px] items-center gap-3 rounded-full bg-[#0F172A] py-1 pl-4 pr-1 text-white shadow-[0px_8px_24px_-8px_rgba(15,23,42,0.45)]">
        <span
          aria-hidden
          className="size-2 shrink-0 rounded-full bg-[#F97316]"
        />
        <p className="min-w-0 truncate text-[13px] font-semibold leading-5">
          {labels.title} ·{" "}
          <span className="font-medium text-white/80">{preview.title}</span>
        </p>
        <button
          type="button"
          onClick={endAdPreview}
          className="inline-flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-full bg-white/10 px-4 text-[13px] font-bold transition-colors hover:bg-white/20"
        >
          <X aria-hidden className="h-4 w-4" />
          {labels.close}
        </button>
      </div>
    </div>
  );
}
