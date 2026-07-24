"use client";

import BannerSlotView from "@/components/banners/BannerSlotView";
import { useBannerCreatives } from "@/lib/banner-slots-client";
import type { BannerPlacement } from "@/lib/banner-placements";

export type BannerSlotProps = {
  placement: BannerPlacement;
  className?: string;
  /** Skip the frame's page padding — see BannerSlotView. */
  bare?: boolean;
};

/**
 * Drop-in banner slot for any client component.
 *
 * Resolves creatives from the shared module store, so N slots on a page cost
 * ONE request and a client-side navigation costs zero. Renders nothing until
 * the store resolves — no reserved space, because most placements are empty
 * most of the time and a permanent hole is worse than a small one-time shift.
 *
 * Where a server component already has the creatives (the landing page fetches
 * them in its RSC), render <BannerSlotView creatives={...}/> directly instead:
 * server-rendered, no flash, no shift.
 */
export default function BannerSlot({
  placement,
  className,
  bare,
}: BannerSlotProps) {
  const creatives = useBannerCreatives(placement);
  return (
    <BannerSlotView
      placement={placement}
      creatives={creatives}
      className={className}
      bare={bare}
    />
  );
}
