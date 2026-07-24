"use client";

import { useEffect, useRef, useState } from "react";
import { Monitor, Smartphone } from "lucide-react";
import BannerSlotView from "@/components/banners/BannerSlotView";
import type { BannerCreative } from "@/lib/banner-creative";
import { getPlacementSpec } from "@/lib/banner-placements";

/**
 * Shows how a banner will actually look on the public site, before it is saved.
 *
 * This renders the REAL `BannerSlotView` — the same component production uses —
 * with the in-progress form values. It is deliberately not a look-alike: a
 * second implementation drifts, and a preview that lies is worse than no
 * preview at all.
 *
 * Isolation from live data is structural rather than a flag: this imports
 * `BannerSlotView` (pure, takes creatives as a prop) and never `BannerSlot`
 * (which fetches). There is no code path from here to /api/banner-slots.
 */
export type BannerLivePreviewProps = {
  placement: string | null | undefined;
  /** Built through the same adapter production uses. Null → empty state. */
  creative: BannerCreative | null;
  emptyLabel: string;
  desktopLabel: string;
  mobileLabel: string;
  className?: string;
};

const FRAME_WIDTH = { desktop: 1160, mobile: 390 } as const;

export default function BannerLivePreview({
  placement,
  creative,
  emptyLabel,
  desktopLabel,
  mobileLabel,
  className,
}: BannerLivePreviewProps) {
  const [viewport, setViewport] = useState<"desktop" | "mobile">("desktop");
  const spec = getPlacementSpec(placement);
  const width = FRAME_WIDTH[viewport];

  // Scale the full-width frame down to fit the admin modal. Because
  // BannerSlotView styles itself with CONTAINER queries, scaling changes only
  // the apparent size — the 390px frame genuinely resolves to the mobile
  // layout, which is the whole point.
  const scale = viewport === "desktop" ? 0.42 : 0.85;

  // A CSS transform doesn't affect layout size, so the parent would reserve the
  // UNSCALED height and leave a large gap. Percentage margins can't fix that —
  // they resolve against the containing block's WIDTH, which is unrelated to
  // the height we need to reclaim. So measure the real height and set it.
  const innerRef = useRef<HTMLDivElement | null>(null);
  const [scaledHeight, setScaledHeight] = useState<number | null>(null);

  useEffect(() => {
    const node = innerRef.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      setScaledHeight(node.offsetHeight * scale);
    });
    observer.observe(node);
    setScaledHeight(node.offsetHeight * scale);
    return () => observer.disconnect();
  }, [scale, creative, placement]);

  return (
    <div className={className}>
      <div className="mb-2 flex items-center justify-between gap-3">
        <span className="pl-1 text-xs font-bold leading-[18px] text-[#334155]">
          {spec ? spec.aspect : ""}
        </span>
        <div className="inline-flex overflow-hidden rounded-lg border border-[#E2E8F0]">
          <button
            type="button"
            onClick={() => setViewport("desktop")}
            aria-pressed={viewport === "desktop"}
            title={desktopLabel}
            className={`inline-flex h-9 items-center gap-1.5 px-3 text-[12px] font-bold ${
              viewport === "desktop"
                ? "bg-[#0F172A] text-white"
                : "bg-white text-[#64748B]"
            }`}
          >
            <Monitor className="h-3.5 w-3.5" />
            {desktopLabel}
          </button>
          <button
            type="button"
            onClick={() => setViewport("mobile")}
            aria-pressed={viewport === "mobile"}
            title={mobileLabel}
            className={`inline-flex h-9 items-center gap-1.5 border-l border-[#E2E8F0] px-3 text-[12px] font-bold ${
              viewport === "mobile"
                ? "bg-[#0F172A] text-white"
                : "bg-white text-[#64748B]"
            }`}
          >
            <Smartphone className="h-3.5 w-3.5" />
            {mobileLabel}
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-[#E2E8F0] bg-[#F8FAFC] p-3">
        {creative && spec ? (
          <div
            className="relative mx-auto overflow-hidden"
            style={{
              width: width * scale,
              height: scaledHeight ?? undefined,
            }}
          >
            <div
              ref={innerRef}
              className="absolute left-0 top-0 origin-top-left bg-white"
              style={{ width, transform: `scale(${scale})` }}
            >
              {/* Page furniture so the placement reads in context. */}
              <div className="h-8 border-b border-[#E2E8F0] bg-[#F1F5F9]" />
              {/* inert: nothing inside the preview is focusable or clickable. */}
              <div inert>
                <BannerSlotView
                  placement={spec.id}
                  creatives={[creative]}
                  interactive={false}
                />
              </div>
              <div className="space-y-2 p-4">
                <div className="h-3 w-1/3 rounded bg-[#E2E8F0]" />
                <div className="h-3 w-2/3 rounded bg-[#F1F5F9]" />
              </div>
            </div>
          </div>
        ) : (
          <div className="flex min-h-[120px] items-center justify-center rounded-xl border border-dashed border-[#CBD5E1] px-4 text-center">
            <p className="text-[13px] font-medium text-[#94A3B8]">
              {emptyLabel}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
