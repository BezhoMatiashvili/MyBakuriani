"use client";

import { useEffect, useState, type ReactNode } from "react";
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
import { useBannerTracking } from "@/lib/banner-tracking";

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
};

export default function BannerSlotView({
  placement,
  creatives,
  className,
  interactive = true,
  bare = false,
}: BannerSlotViewProps) {
  const [expanded, setExpanded] = useState<BannerCreative | null>(null);

  const spec = getPlacementSpec(placement);
  // An unmapped placement renders nothing rather than throwing. Never replace
  // this with an index lookup.
  if (!spec) return null;

  const mine = creatives.filter((c) => c.placement === spec.id);
  if (mine.length === 0) return null;

  const shown = rendersSingleCreative(spec.renderStyle)
    ? mine.slice(0, 1)
    : mine;

  const body = (
    <>
      {shown.map((creative) => (
        <Creative
          key={creative.id}
          creative={creative}
          style={spec.renderStyle}
          compactHomePromo={spec.id === "home_promo"}
          interactive={interactive}
          onExpand={setExpanded}
        />
      ))}
    </>
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
      <div className={`@container w-full ${className ?? ""}`}>{children}</div>
    );
  }

  switch (style) {
    case "strip":
      return (
        <div
          className={`@container mx-auto w-full max-w-[1160px] space-y-3 px-4 ${className ?? ""}`}
        >
          {children}
        </div>
      );

    case "promo-card":
      return (
        <section className={`@container px-4 pb-8 pt-4 ${className ?? ""}`}>
          <div className="mx-auto max-w-[1160px] space-y-4">{children}</div>
        </section>
      );

    case "leaderboard":
      return (
        <section className={`@container px-4 py-6 ${className ?? ""}`}>
          <div className="mx-auto max-w-[1160px]">{children}</div>
        </section>
      );

    case "sidebar":
      return (
        <div className={`@container w-full ${className ?? ""}`}>{children}</div>
      );

    case "in-grid":
      // Occupies exactly one cell of the caller's existing grid.
      return (
        <div className={`@container h-full w-full ${className ?? ""}`}>
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
}: {
  creative: BannerCreative;
  style: BannerRenderStyle;
  compactHomePromo: boolean;
  interactive: boolean;
  onExpand: (creative: BannerCreative) => void;
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
          aspectClass="aspect-[1160/180] min-h-[110px]"
        />
      );
    case "sidebar":
      return (
        <MediaCreative
          creative={creative}
          interactive={interactive}
          onExpand={onExpand}
          aspectClass="aspect-[4/5]"
        />
      );
    case "in-grid":
      return (
        <MediaCreative
          creative={creative}
          interactive={interactive}
          onExpand={onExpand}
          aspectClass="aspect-square"
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
      className="pointer-events-none absolute right-2 top-2 z-10 rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.5px] text-white/95"
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
 *  - editorial  → a button that opens the detail modal (existing behaviour)
 *  - preview    → an inert div
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
  const { ref, reportClick } = useBannerTracking(creative, interactive);

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
        onClick={reportClick}
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
  aspectClass,
}: {
  creative: BannerCreative;
  interactive: boolean;
  onExpand: (creative: BannerCreative) => void;
  aspectClass: string;
}) {
  const t = useTranslations("Shared");
  const tone = getTonePalette(creative.tone);
  const [failed, setFailed] = useState(false);

  if (failed) return null;

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
          autoPlay
          loop
          muted
          playsInline
          onError={() => setFailed(true)}
          className="h-full w-full object-cover"
        />
      ) : creative.imageUrl ? (
        <Image
          src={creative.imageUrl}
          alt={creative.title}
          fill
          sizes="(max-width: 768px) 100vw, 1160px"
          onError={() => setFailed(true)}
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

  return (
    <CreativeShell
      creative={creative}
      interactive={interactive}
      onExpand={onExpand}
      className="relative flex cursor-pointer flex-col items-start gap-3 rounded-2xl border px-5 py-4 @[640px]:flex-row @[640px]:items-center @[640px]:justify-between"
      style={{ backgroundColor: tone.bg, borderColor: tone.border }}
    >
      <div className="flex items-start gap-3">
        {creative.imageUrl ? (
          <div className="relative size-10 shrink-0 overflow-hidden rounded-lg">
            <Image
              src={creative.imageUrl}
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

  const card = (
    <CreativeShell
      creative={creative}
      interactive={interactive}
      onExpand={onExpand}
      className={
        compactHomePromo
          ? "relative flex min-h-[112px] cursor-pointer flex-row overflow-hidden rounded-[18px] border shadow-[0px_1px_3px_rgba(0,0,0,0.04)] @[768px]:rounded-[24px] @[1024px]:h-[180px]"
          : "relative flex cursor-pointer flex-col overflow-hidden rounded-[24px] border shadow-[0px_1px_3px_rgba(0,0,0,0.04)] @[768px]:flex-row @[1024px]:h-[180px]"
      }
      style={{ backgroundColor: tone.bg, borderColor: tone.border }}
    >
      {creative.videoUrl ? (
        <div
          className={
            compactHomePromo
              ? "relative w-[104px] shrink-0 @[768px]:h-auto @[768px]:w-[320px]"
              : "relative h-[180px] w-full shrink-0 @[768px]:h-auto @[768px]:w-[320px]"
          }
        >
          <video
            src={creative.videoUrl}
            poster={creative.videoPosterUrl ?? creative.imageUrl ?? undefined}
            autoPlay
            loop
            muted
            playsInline
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
              ? "relative w-[104px] shrink-0 @[768px]:h-auto @[768px]:w-[320px]"
              : "relative h-[180px] w-full shrink-0 @[768px]:h-auto @[768px]:w-[320px]"
          }
        >
          <Image
            src={creative.imageUrl}
            alt=""
            fill
            sizes={
              compactHomePromo
                ? "(max-width: 767px) 104px, 320px"
                : "(max-width: 768px) 100vw, 320px"
            }
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
            ? "flex min-w-0 flex-1 flex-col items-start justify-center gap-2 px-3 py-3 @[768px]:flex-row @[768px]:items-center @[768px]:justify-between @[768px]:gap-3 @[768px]:px-10 @[768px]:py-6"
            : "flex flex-1 flex-col items-start justify-center gap-3 px-6 py-6 @[768px]:flex-row @[768px]:items-center @[768px]:justify-between @[768px]:px-10"
        }
      >
        <div className="max-w-[520px]">
          <h3
            className={
              compactHomePromo
                ? "line-clamp-2 text-[15px] font-black leading-[19px] @[768px]:text-[22px] @[768px]:leading-[28px]"
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
  const style = large || compact
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
        onClick={(e) => e.stopPropagation()}
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
      onClick={(e) => e.stopPropagation()}
      className={cls}
      style={style}
    >
      {creative.ctaLabel}
    </Link>
  );
}
