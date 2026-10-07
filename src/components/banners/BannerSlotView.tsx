"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Maximize2, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import BannerDetailModal from "@/components/shared/BannerDetailModal";
import ScrollReveal from "@/components/shared/ScrollReveal";
import {
  getTonePalette,
  sponsoredLabel,
  type BannerCreative,
} from "@/lib/banner-creative";
import {
  getPlacementSpec,
  rendersSingleCreative,
  type BannerRenderStyle,
} from "@/lib/banner-placements";
import {
  reportBannerEvent,
  useBannerViewTracking,
  useEmptySlotTracking,
} from "@/lib/banner-tracking";
import { useSlotRotation } from "@/lib/banner-slots-client";

/**
 * The single public banner renderer. Pure and presentational — it NEVER fetches.
 * `BannerSlot` resolves creatives from the shared store and hands them here;
 * the admin preview hands them here directly. That is what makes the preview
 * structurally incapable of drifting from production.
 *
 * TWO INVARIANTS, both load-bearing:
 *
 * 1. NO `useTranslations` / `useMessages` anywhere in this file or its transitive
 *    imports beyond the "Shared" namespace (already in PUBLIC_NAMESPACES, via
 *    BannerDetailModal). Banner copy comes from the database; the only static
 *    string is the advertising disclosure, which uses `useLocale()` + a literal
 *    map. `scripts/i18n-scope.mjs` (wired as `prebuild`) enforces this.
 *
 * 2. NO viewport breakpoints (`sm:` / `md:` / `lg:`). Responsive styling uses
 *    CONTAINER queries with arbitrary widths — `@[640px]:`, `@[768px]:` — never
 *    the named ones (Tailwind's `@md` is 448px, not the site's 768px). This is
 *    what makes the admin's 390px preview frame truthful: a viewport-prefixed
 *    class would render the desktop layout inside a narrow box and lie.
 */
export type BannerSlotViewProps = {
  placement: string | null | undefined;
  creatives: BannerCreative[];
  className?: string;
  /** Preview mode: no navigation, no modal, no tracking. */
  interactive?: boolean;
  /**
   * Drop the frame's own page padding / max-width. Use when the slot is mounted
   * inside a container that already provides them — e.g. as a `col-span-full`
   * cell of an existing listing grid.
   */
  bare?: boolean;
  /** Sponsored grid card index on the page (0, 1) — see interleaveSponsored. */
  position?: number;
};

/**
 * The current display of the slot (C47), read by every creative shell: the
 * key re-arms its impression on a new page view or re-draw, and the creative
 * holding the placement's ad position is counted toward actual SOV.
 */
const SlotDisplayContext = createContext<{
  displayKey: string;
  slotCreativeId: string | null;
}>({ displayKey: "", slotCreativeId: null });

export default function BannerSlotView({
  placement,
  creatives,
  className,
  interactive = true,
  bare = false,
  position = 0,
}: BannerSlotViewProps) {
  const [expanded, setExpanded] = useState<BannerCreative | null>(null);
  // Creatives whose image or video failed to load. They leave the slot, so a
  // single-creative placement falls back to the next one (or renders nothing)
  // instead of keeping an empty frame — in a listing grid that was a blank
  // card-sized hole.
  const [failedIds, setFailedIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const dropCreative = useCallback((id: string) => {
    setFailedIds((prev) => (prev.has(id) ? prev : new Set(prev).add(id)));
  }, []);

  // Every way into the detail window (an editorial banner's body, a video's
  // expand button) goes through here, so this is where an "open" is counted.
  function expand(creative: BannerCreative) {
    reportBannerEvent(creative, "open");
    setExpanded(creative);
  }

  const spec = getPlacementSpec(placement);
  const mine = spec
    ? creatives.filter((c) => c.placement === spec.id && !failedIds.has(c.id))
    : [];

  // C47: which of them this page view shows — the media plan's share-of-voice
  // draw (after mount), house fill, grid positions, phone limits and the
  // sidebar's 45 s refresh (src/lib/banner-slots-client.ts).
  const display = useSlotRotation(spec?.id ?? "", mine, {
    single: spec ? rendersSingleCreative(spec.renderStyle) : true,
    interactive,
    position,
    refresh: spec?.renderStyle === "sidebar",
  });
  // An ad position seen with nothing drawn into it still counts toward the
  // slot's displays (actual SOV). Not for grid cards: their marker could not
  // sit where the card would have been.
  const markEmpty =
    interactive &&
    display.emptyAdPosition &&
    spec != null &&
    spec.renderStyle !== "in-grid";
  const emptyRef = useEmptySlotTracking(
    spec?.id ?? "",
    markEmpty,
    display.displayKey,
  );

  // An unmapped placement renders nothing rather than throwing. Never replace
  // this with an index lookup.
  if (!spec) return null;
  if (mine.length === 0) return null;

  const shown = display.shown;
  // Absolutely positioned and 1 px: no grid cell, no layout shift.
  const marker = markEmpty ? (
    <span
      ref={emptyRef}
      aria-hidden
      data-ad-position="empty"
      className={`pointer-events-none h-px w-px opacity-0 ${
        spec.renderStyle === "sticky" ? "fixed bottom-2 left-2" : "absolute"
      }`}
    />
  ) : null;
  if (shown.length === 0) return marker;

  const body = (
    <SlotDisplayContext.Provider
      value={{
        displayKey: display.displayKey,
        slotCreativeId: display.slotCreativeId,
      }}
    >
      {marker}
      {shown.map((creative) => (
        <Creative
          key={creative.id}
          creative={creative}
          style={spec.renderStyle}
          compactHomePromo={spec.id === "home_promo"}
          interactive={interactive}
          onExpand={expand}
          onMediaError={dropCreative}
        />
      ))}
    </SlotDisplayContext.Provider>
  );

  return (
    <>
      <SlotFrame
        style={spec.renderStyle}
        className={className}
        bare={bare}
        count={shown.length}
      >
        {body}
      </SlotFrame>
      {/* Rendered outside the frame so its z-50 isn't trapped in a lower
          stacking context (the sticky frame is z-40 + pointer-events-none). */}
      {interactive ? (
        <BannerDetailModal
          creative={expanded}
          onClose={() => setExpanded(null)}
        />
      ) : null}
    </>
  );
}

/* ------------------------------------------------------------------ frames */

function SlotFrame({
  style,
  className,
  bare,
  count,
  children,
}: {
  style: BannerRenderStyle;
  className?: string;
  bare?: boolean;
  count: number;
  children: ReactNode;
}) {
  const pathname = usePathname();

  // Mounted inside a container that already owns padding + max-width.
  if (bare) {
    return (
      <div className={`@container isolate w-full ${className ?? ""}`}>{children}</div>
    );
  }

  switch (style) {
    case "strip":
      return (
        <div
          className={`@container isolate mx-auto w-full max-w-[1160px] space-y-3 px-4 ${className ?? ""}`}
        >
          {children}
        </div>
      );

    case "promo-card":
      return (
        <section className={`@container isolate px-4 pb-8 pt-4 ${className ?? ""}`}>
          <div className="mx-auto max-w-[1160px] space-y-4">{children}</div>
        </section>
      );

    case "leaderboard":
      return (
        <section className={`@container isolate px-4 py-6 ${className ?? ""}`}>
          <div className="mx-auto max-w-[1160px]">{children}</div>
        </section>
      );

    case "sidebar":
      return (
        <div className={`@container isolate w-full ${className ?? ""}`}>{children}</div>
      );

    case "mobile-strip":
      // Phones only: useSlotRotation draws nothing on a wider screen.
      return (
        <div className={`@container isolate w-full px-4 pt-3 ${className ?? ""}`}>
          {children}
        </div>
      );

    case "in-grid":
      // Occupies exactly one cell of the caller's existing grid.
      return (
        <div className={`@container isolate h-full w-full ${className ?? ""}`}>
          {children}
        </div>
      );

    case "sticky": {
      // Detail pages render MobileStickyCTA (fixed bottom-0, lg:hidden) — below
      // lg the bar must stack above it instead of covering the primary CTA.
      // Transport detail uses TransportContactFooter, which is fixed at ALL
      // breakpoints, so that one needs the offset on desktop too.
      // These are true viewport concerns (they depend on the real window, not on
      // this component's width), so viewport prefixes are correct here.
      const path = pathname ?? "";
      const isDetailRoute =
        /\/(apartments|hotels|sales|food|services|entertainment|transport|employment)\/[^/]+$/.test(
          path,
        ) && !/\/sales\/all$/.test(path);
      const isTransportDetail = /\/transport\/[^/]+$/.test(path);
      const bottom = isTransportDetail
        ? "bottom-[calc(var(--mobile-fixed-action-height)+env(safe-area-inset-bottom))]"
        : isDetailRoute
          ? "bottom-[calc(var(--mobile-fixed-action-height)+env(safe-area-inset-bottom))] lg:bottom-0"
          : "bottom-0";
      return (
        <div
          data-testid="sticky-promo-container"
          className={`@container pointer-events-none fixed inset-x-0 z-40 flex justify-center px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:pb-4 ${bottom} ${className ?? ""}`}
        >
          {children}
        </div>
      );
    }

    default:
      // Exhaustive in practice; a future render style renders nothing rather
      // than crashing the page it was dropped into.
      void count;
      return null;
  }
}

/* --------------------------------------------------------------- creatives */

function Creative({
  creative,
  style,
  compactHomePromo,
  interactive,
  onExpand,
  onMediaError,
}: {
  creative: BannerCreative;
  style: BannerRenderStyle;
  compactHomePromo: boolean;
  interactive: boolean;
  onExpand: (creative: BannerCreative) => void;
  /** Media-first styles only: the creative is nothing without its media. */
  onMediaError: (creativeId: string) => void;
}) {
  switch (style) {
    case "strip":
      return (
        <StripCreative
          creative={creative}
          interactive={interactive}
          onExpand={onExpand}
        />
      );
    case "promo-card":
      return (
        <PromoCardCreative
          creative={creative}
          compactHomePromo={compactHomePromo}
          interactive={interactive}
          onExpand={onExpand}
        />
      );
    case "leaderboard":
      return (
        <MediaCreative
          creative={creative}
          interactive={interactive}
          onExpand={onExpand}
          onMediaError={onMediaError}
          aspectClass="aspect-[1160/180] min-h-[110px]"
        />
      );
    case "sidebar":
      return (
        <MediaCreative
          creative={creative}
          interactive={interactive}
          onExpand={onExpand}
          onMediaError={onMediaError}
          aspectClass="aspect-[4/5]"
        />
      );
    case "in-grid":
      return (
        <MediaCreative
          creative={creative}
          interactive={interactive}
          onExpand={onExpand}
          onMediaError={onMediaError}
          aspectClass="aspect-square"
        />
      );
    case "mobile-strip":
      // The rate card's "Responsive" strip, drawn at 320×100.
      return (
        <MediaCreative
          creative={creative}
          interactive={interactive}
          onExpand={onExpand}
          onMediaError={onMediaError}
          aspectClass="aspect-[32/10]"
        />
      );
    case "sticky":
      return (
        <StickyCreative
          creative={creative}
          interactive={interactive}
          onExpand={onExpand}
        />
      );
    default:
      return null;
  }
}

/** Small "რეკლამა" disclosure. Not optional, not admin-configurable. */
function SponsoredBadge({ tone }: { tone: ReturnType<typeof getTonePalette> }) {
  const locale = useLocale();
  return (
    <span
      data-sponsored="true"
      // No z-10 here: `@container` (container-type: inline-size) does not
      // create a stacking context, so a positive z-index escaped into the ROOT
      // stacking context and painted this badge over the search filter panel
      // (tester PDF p.7: the black "რეკლამა" pill showing through the white
      // block). The badge still paints above its own creative because it comes
      // after the media in DOM order. SlotFrame now also isolates its subtree.
      className="pointer-events-none absolute right-2 top-2 rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.5px] text-white/95"
      style={{ backgroundColor: tone.badgeBg }}
    >
      {sponsoredLabel(locale)}
    </span>
  );
}

/**
 * Wraps a creative in the right interactive shell:
 *  - sponsored  → a single anchor to the advertiser, opened in a new tab with
 *                 rel="sponsored", and a click beacon
 *  - editorial  → a button that opens the detail modal (counted as an open)
 *  - preview    → an inert div
 * Every interactive shell counts an impression (C46, C47).
 */
function CreativeShell({
  creative,
  interactive,
  onExpand,
  className,
  style,
  children,
}: {
  creative: BannerCreative;
  interactive: boolean;
  onExpand: (creative: BannerCreative) => void;
  className: string;
  style?: React.CSSProperties;
  children: ReactNode;
}) {
  const { displayKey, slotCreativeId } = useContext(SlotDisplayContext);
  const ref = useBannerViewTracking(creative, interactive, {
    displayKey,
    slot: slotCreativeId === creative.id,
  });

  if (!interactive) {
    return (
      <div className={className} style={style}>
        {children}
      </div>
    );
  }

  if (creative.sponsored && creative.href) {
    return (
      <a
        ref={ref as (node: HTMLAnchorElement | null) => void}
        href={creative.href}
        target="_blank"
        rel="sponsored nofollow noopener noreferrer"
        onClick={() => reportBannerEvent(creative, "click")}
        className={className}
        style={style}
      >
        {children}
      </a>
    );
  }

  return (
    <div
      ref={ref as (node: HTMLDivElement | null) => void}
      role="button"
      tabIndex={0}
      onClick={() => onExpand(creative)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onExpand(creative);
      }}
      className={className}
      style={style}
    >
      {children}
    </div>
  );
}

/** Media-first styles: leaderboard, sidebar, in-grid. */
function MediaCreative({
  creative,
  interactive,
  onExpand,
  onMediaError,
  aspectClass,
}: {
  creative: BannerCreative;
  interactive: boolean;
  onExpand: (creative: BannerCreative) => void;
  onMediaError: (creativeId: string) => void;
  aspectClass: string;
}) {
  const t = useTranslations("Shared");
  const tone = getTonePalette(creative.tone);

  const shell = (
    <CreativeShell
      creative={creative}
      interactive={interactive}
      onExpand={onExpand}
      className={`relative block w-full cursor-pointer overflow-hidden rounded-[20px] border ${aspectClass}`}
      style={{ backgroundColor: tone.bg, borderColor: tone.border }}
    >
      {creative.videoUrl ? (
        <video
          src={creative.videoUrl}
          poster={creative.videoPosterUrl ?? creative.imageUrl ?? undefined}
          // metadata: don't let a banner video's full download compete with the
          // hero/LCP images for bandwidth; autoplay still starts it once ready.
          preload="metadata"
          autoPlay
          loop
          muted
          playsInline
          onError={() => onMediaError(creative.id)}
          className="h-full w-full object-cover"
        />
      ) : creative.imageUrl ? (
        <Image
          src={creative.imageUrl}
          alt={creative.title}
          fill
          sizes="(max-width: 768px) 100vw, 1160px"
          onError={() => onMediaError(creative.id)}
          className="object-cover"
        />
      ) : null}

      {creative.sponsored ? <SponsoredBadge tone={tone} /> : null}

      {/* Title overlay — the creative image usually carries its own copy, so
          this stays a low, legible gradient strip rather than a card. */}
      <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent px-4 pb-3 pt-8 text-[13px] font-bold leading-[19px] text-white @[640px]:text-[15px]">
        {creative.title}
      </span>
    </CreativeShell>
  );

  // No video → nothing to expand; the crop only hides content for moving media.
  if (!creative.videoUrl) return shell;

  // Sibling of the shell, not a child: for a sponsored creative the shell is an
  // <a>, and a nested button is both invalid nesting and swallowed by the title
  // overlay (which is not pointer-events-none). Rendered after it, it paints on
  // top with no z-index games. Inert in preview rather than hidden, like
  // CreativeCta, so the admin's 390px frame stays truthful.
  const expandCls =
    "absolute bottom-3 right-3 inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/30 bg-black/45 text-white backdrop-blur-sm";

  return (
    <div className="relative h-full w-full">
      {shell}
      {interactive ? (
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onExpand(creative);
          }}
          aria-label={t("bannerExpand")}
          className={expandCls}
        >
          <Maximize2 className="h-4 w-4" />
        </button>
      ) : (
        <span aria-hidden className={expandCls}>
          <Maximize2 className="h-4 w-4" />
        </span>
      )}
    </div>
  );
}

/** Thin informational strip — ports the pre-placement InfoBanners look. */
function StripCreative({
  creative,
  interactive,
  onExpand,
}: {
  creative: BannerCreative;
  interactive: boolean;
  onExpand: (creative: BannerCreative) => void;
}) {
  const tone = getTonePalette(creative.tone);
  // Text-led: a broken thumbnail falls back to the icon, the strip stays.
  const [imageFailed, setImageFailed] = useState(false);

  return (
    <CreativeShell
      creative={creative}
      interactive={interactive}
      onExpand={onExpand}
      className="relative flex cursor-pointer flex-col items-start gap-3 rounded-2xl border px-5 py-4 @[640px]:flex-row @[640px]:items-center @[640px]:justify-between"
      style={{ backgroundColor: tone.bg, borderColor: tone.border }}
    >
      <div className="flex items-start gap-3">
        {creative.imageUrl && !imageFailed ? (
          <div className="relative size-10 shrink-0 overflow-hidden rounded-lg">
            <Image
              src={creative.imageUrl}
              alt=""
              fill
              sizes="40px"
              onError={() => setImageFailed(true)}
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
            {creative.title}
          </span>
          {creative.body ? <> — {creative.body}</> : null}
        </p>
      </div>
      {creative.ctaLabel && creative.href ? (
        <CreativeCta
          creative={creative}
          tone={tone}
          interactive={interactive}
        />
      ) : null}
      {creative.sponsored ? <SponsoredBadge tone={tone} /> : null}
    </CreativeShell>
  );
}

/** Media + copy + CTA card — ports the pre-placement PromoBanners look. */
function PromoCardCreative({
  creative,
  compactHomePromo,
  interactive,
  onExpand,
}: {
  creative: BannerCreative;
  compactHomePromo: boolean;
  interactive: boolean;
  onExpand: (creative: BannerCreative) => void;
}) {
  const tone = getTonePalette(creative.tone);
  // Text-led: a broken image or video drops the media column, the card stays.
  const [mediaFailed, setMediaFailed] = useState(false);

  const card = (
    <CreativeShell
      creative={creative}
      interactive={interactive}
      onExpand={onExpand}
      className={
        compactHomePromo
          ? "relative flex min-h-[128px] cursor-pointer flex-row overflow-hidden rounded-[18px] border shadow-[0px_1px_3px_rgba(0,0,0,0.04)] @[768px]:rounded-[24px] @[1024px]:h-[180px]"
          : "relative flex cursor-pointer flex-col overflow-hidden rounded-[24px] border shadow-[0px_1px_3px_rgba(0,0,0,0.04)] @[768px]:flex-row @[1024px]:h-[180px]"
      }
      style={{ backgroundColor: tone.bg, borderColor: tone.border }}
    >
      {mediaFailed ? null : creative.videoUrl ? (
        <div
          className={
            compactHomePromo
              ? "relative w-[128px] shrink-0 @[768px]:h-auto @[768px]:w-[320px]"
              : "relative h-[180px] w-full shrink-0 @[768px]:h-auto @[768px]:w-[320px]"
          }
        >
          <video
            src={creative.videoUrl}
            poster={creative.videoPosterUrl ?? creative.imageUrl ?? undefined}
            preload="metadata"
            autoPlay
            loop
            muted
            playsInline
            onError={() => setMediaFailed(true)}
            className="h-full w-full object-cover"
          />
          <PromoTag
            tone={tone}
            sponsored={creative.sponsored}
            compact={compactHomePromo}
          />
        </div>
      ) : creative.imageUrl ? (
        <div
          className={
            compactHomePromo
              ? "relative w-[128px] shrink-0 @[768px]:h-auto @[768px]:w-[320px]"
              : "relative h-[180px] w-full shrink-0 @[768px]:h-auto @[768px]:w-[320px]"
          }
        >
          <Image
            src={creative.imageUrl}
            alt=""
            fill
            sizes={
              compactHomePromo
                ? "(max-width: 767px) 128px, 320px"
                : "(max-width: 768px) 100vw, 320px"
            }
            onError={() => setMediaFailed(true)}
            className="object-cover"
          />
          <PromoTag
            tone={tone}
            sponsored={creative.sponsored}
            compact={compactHomePromo}
          />
        </div>
      ) : null}
      <div
        className={
          compactHomePromo
            ? "flex min-w-0 flex-1 flex-col items-start justify-center gap-1.5 px-3 py-3 @[768px]:flex-row @[768px]:items-center @[768px]:justify-between @[768px]:gap-3 @[768px]:px-10 @[768px]:py-6"
            : "flex flex-1 flex-col items-start justify-center gap-3 px-6 py-6 @[768px]:flex-row @[768px]:items-center @[768px]:justify-between @[768px]:px-10"
        }
      >
        <div className="max-w-[520px]">
          <h3
            className={
              compactHomePromo
                ? "line-clamp-1 text-[15px] font-black leading-[19px] @[768px]:text-[22px] @[768px]:leading-[28px]"
                : "text-[22px] font-black leading-[28px]"
            }
            style={{ color: tone.title }}
          >
            {creative.title}
          </h3>
          {creative.body ? (
            <p
              className={
                compactHomePromo
                  ? "mt-1 line-clamp-2 text-[11px] font-medium leading-[15px] @[768px]:mt-2 @[768px]:text-[13px] @[768px]:leading-[20px]"
                  : "mt-2 text-[13px] font-medium leading-[20px]"
              }
              style={{ color: tone.text }}
            >
              {creative.body}
            </p>
          ) : null}
        </div>
        {creative.ctaLabel && creative.href ? (
          <CreativeCta
            creative={creative}
            tone={tone}
            interactive={interactive}
            large={!compactHomePromo}
            compact={compactHomePromo}
          />
        ) : null}
      </div>
    </CreativeShell>
  );

  return interactive ? <ScrollReveal>{card}</ScrollReveal> : card;
}

function PromoTag({
  tone,
  sponsored,
  compact,
}: {
  tone: ReturnType<typeof getTonePalette>;
  sponsored: boolean;
  compact?: boolean;
}) {
  const locale = useLocale();
  return (
    <span
      data-sponsored={sponsored ? "true" : undefined}
      className={
        compact
          ? "absolute left-2 top-2 rounded-md px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white @[768px]:left-4 @[768px]:top-4 @[768px]:px-3 @[768px]:py-1 @[768px]:text-[11px]"
          : "absolute left-4 top-4 rounded-md px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-white"
      }
      style={{ backgroundColor: tone.badgeBg }}
    >
      {sponsored ? sponsoredLabel(locale) : "PROMO"}
    </span>
  );
}

/** Fixed bottom bar with per-creative dismissal. Ports StickyNewsBar. */
const DISMISS_KEY = "mybakuriani:sticky_news:dismissed";

function StickyCreative({
  creative,
  interactive,
  onExpand,
}: {
  creative: BannerCreative;
  interactive: boolean;
  onExpand: (creative: BannerCreative) => void;
}) {
  // "Shared" only — already in PUBLIC_NAMESPACES and already pulled in by
  // BannerDetailModal, so this adds no namespace to the public bundle.
  const t = useTranslations("Shared");
  const tone = getTonePalette(creative.tone);
  const [dismissed, setDismissed] = useState(false);
  const [hydrated, setHydrated] = useState(!interactive);

  // Dismissal lives in localStorage, so the bar must not paint until we've read
  // it — otherwise it flashes for a user who already closed it. The preview has
  // no storage to consult and renders immediately.
  useEffect(() => {
    if (!interactive) return;
    try {
      const raw = window.localStorage.getItem(DISMISS_KEY);
      const seen = raw ? (JSON.parse(raw) as string[]) : [];
      if (seen.includes(creative.sourceId)) setDismissed(true);
    } catch {
      // storage unavailable — treat as not dismissed
    }
    setHydrated(true);
  }, [interactive, creative.sourceId]);

  if (!hydrated || dismissed) return null;

  function dismiss() {
    setDismissed(true);
    try {
      const raw = window.localStorage.getItem(DISMISS_KEY);
      const seen = raw ? (JSON.parse(raw) as string[]) : [];
      if (!seen.includes(creative.sourceId)) {
        window.localStorage.setItem(
          DISMISS_KEY,
          JSON.stringify([...seen, creative.sourceId]),
        );
      }
    } catch {
      // ignore
    }
  }

  return (
    <CreativeShell
      creative={creative}
      interactive={interactive}
      onExpand={onExpand}
      className="pointer-events-auto relative flex min-h-16 max-h-[72px] w-full max-w-[1160px] cursor-pointer flex-nowrap items-center justify-between gap-2 overflow-hidden rounded-2xl border px-3 py-2 shadow-[0px_8px_24px_-8px_rgba(15,23,42,0.25)] @[640px]:gap-3 @[640px]:px-5"
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
          className="min-w-0 text-[12px] font-medium leading-[18px] line-clamp-2 @[640px]:text-[13px] @[640px]:leading-[20px]"
          style={{ color: tone.text }}
        >
          <span className="font-bold" style={{ color: tone.title }}>
            {creative.title}
          </span>
          {creative.body ? <> — {creative.body}</> : null}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {creative.ctaLabel && creative.href ? (
          <CreativeCta
            creative={creative}
            tone={tone}
            interactive={interactive}
          />
        ) : null}
        {interactive ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              dismiss();
            }}
            aria-label={t("close")}
            className="inline-flex size-11 items-center justify-center rounded-full border bg-white"
            style={{ borderColor: tone.ctaBorder, color: tone.text }}
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}
      </div>
    </CreativeShell>
  );
}

function CreativeCta({
  creative,
  tone,
  interactive,
  large,
  compact,
}: {
  creative: BannerCreative;
  tone: ReturnType<typeof getTonePalette>;
  interactive: boolean;
  large?: boolean;
  compact?: boolean;
}) {
  const cls = compact
    ? "inline-flex min-h-11 max-w-full shrink-0 items-center rounded-xl border bg-white px-3 py-2 text-[11px] font-bold transition-colors @[768px]:rounded-full @[768px]:border-2 @[768px]:px-6 @[768px]:py-3 @[768px]:text-[13px]"
    : large
      ? "shrink-0 rounded-full border-2 bg-white px-6 py-3 text-[13px] font-bold transition-colors"
      : "inline-flex min-h-11 shrink-0 items-center rounded-full border bg-white px-3 py-2 text-[12px] font-bold transition-colors @[640px]:px-4";
  const style =
    large || compact
      ? { borderColor: tone.ctaText, color: tone.ctaText }
      : { borderColor: tone.ctaBorder, color: tone.ctaText };

  if (!interactive || !creative.href) {
    return (
      <span className={cls} style={style}>
        {creative.ctaLabel}
      </span>
    );
  }

  if (creative.external) {
    return (
      <a
        href={creative.href}
        target="_blank"
        rel={
          creative.sponsored
            ? "sponsored nofollow noopener noreferrer"
            : "noopener noreferrer"
        }
        onClick={(e) => {
          e.stopPropagation();
          reportBannerEvent(creative, "click");
        }}
        className={cls}
        style={style}
      >
        {creative.ctaLabel}
      </a>
    );
  }

  return (
    <Link
      href={creative.href}
      onClick={(e) => {
        e.stopPropagation();
        reportBannerEvent(creative, "click");
      }}
      className={cls}
      style={style}
    >
      {creative.ctaLabel}
    </Link>
  );
}
