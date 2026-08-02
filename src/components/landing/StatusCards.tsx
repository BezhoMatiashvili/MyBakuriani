"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale } from "next-intl";
import { ChevronDown, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import { ICON_MAP } from "@/lib/status-cards/icons";
import {
  pickLocalized,
  type StatusCard,
  type StatusCardItem,
  type StatusKind,
} from "@/lib/status-cards/types";
import BottomSheet from "@/components/shared/BottomSheet";
import { safeHttpsUrl } from "@/lib/security";

const DOT_COLOR: Record<StatusKind, string | null> = {
  ok: "#22C55E",
  warn: "#F59E0B",
  closed: "#EF4444",
  none: null,
};

function StatusDot({ status }: { status: StatusKind }) {
  const color = DOT_COLOR[status];
  if (!color) return null;
  return (
    <span
      className="size-2 shrink-0 rounded-full"
      style={{ backgroundColor: color }}
    />
  );
}

function ItemRow({
  item,
  locale,
  variant,
}: {
  item: StatusCardItem;
  locale: string;
  variant: "dark" | "light";
}) {
  const label = pickLocalized(item.label, locale);
  const value = pickLocalized(item.value, locale);
  const labelColor = variant === "dark" ? "text-[#E2E8F0]" : "text-[#1E293B]";
  const valueColor = variant === "dark" ? "text-[#94A3B8]" : "text-[#64748B]";
  const href = safeHttpsUrl(item.url);
  return (
    <li className="flex items-center justify-between gap-3 text-[14px]">
      <span className={cn("flex items-center gap-2 font-medium", labelColor)}>
        <StatusDot status={item.status} />
        {label}
      </span>
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-1 font-semibold text-[#2E79FF] hover:underline"
        >
          {value || "Live"}
          <ExternalLink className="size-3.5" />
        </a>
      ) : value ? (
        <span className={cn("font-semibold", valueColor)}>{value}</span>
      ) : null}
    </li>
  );
}

export default function StatusCards({
  cards,
  className,
  mobileLayout = "preview",
}: {
  cards: StatusCard[];
  className?: string;
  mobileLayout?: "preview" | "single-page";
}) {
  const locale = useLocale();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  // The mobile/tablet BottomSheet stays mounted (only CSS-hidden via
  // `lg:hidden`) so
  // its scroll-lock effect must be told when it isn't actually visible —
  // otherwise expanding a card on desktop locks body scroll and breaks the
  // sticky Navbar above it.
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 1023px)");
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  // Close the desktop dropdown when clicking outside the card grid / on Escape.
  // Skipped on mobile — the BottomSheet handles its own close (backdrop/X/drag),
  // and this handler's gridRef check doesn't cover the sheet's content, which
  // renders as a sibling and would otherwise close on every tap inside it.
  useEffect(() => {
    if (!expandedId || isMobile) return;
    const onPointer = (e: MouseEvent) => {
      if (!gridRef.current?.contains(e.target as Node)) setExpandedId(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setExpandedId(null);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [expandedId, isMobile]);

  if (cards.length === 0) return null;

  const expandedCard = cards.find((c) => c.id === expandedId) ?? null;
  const isSinglePage = mobileLayout === "single-page";

  return (
    <>
      <div
        ref={gridRef}
        data-status-layout={mobileLayout}
        className={cn(
          isSinglePage
            ? "scrollbar-hide relative -mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto overscroll-x-contain scroll-px-4 px-4 md:mx-0 md:grid md:grid-cols-4 md:overflow-visible md:px-0"
            : "scrollbar-hide relative -mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto overscroll-x-contain scroll-px-4 px-4 sm:mx-0 sm:grid sm:grid-cols-4 sm:overflow-visible sm:px-0",
          className,
        )}
      >
        {cards.map((card) => {
          const Icon = ICON_MAP[card.icon];
          const canExpand = card.expandable && card.items.length > 0;
          const isOpen = expandedId === card.id;
          const label = pickLocalized(card.label, locale);
          const value = pickLocalized(card.value, locale);

          const inner = (
            <div className="flex w-full flex-col gap-1">
              <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.55px] text-[#94A3B8]">
                {card.redDot && (
                  <span className="size-2 rounded-full bg-[#EF4444]" />
                )}
                {label}
              </span>
              <span className="flex items-center gap-2 text-[18px] font-black leading-[28px] text-white sm:text-[20px]">
                {value}
                {Icon && <Icon className="size-[18px] text-[#CBD5E1]" />}
                {canExpand && (
                  <ChevronDown
                    className={cn(
                      "ml-auto size-4 text-[#94A3B8] transition-transform",
                      isOpen && "rotate-180",
                    )}
                  />
                )}
              </span>
            </div>
          );

          const cardClass = cn(
            "flex min-h-20 items-center rounded-[16px] border border-white/5 bg-[#222A3B] px-4 py-4 shadow-[0px_10px_15px_-3px_rgba(0,0,0,0.1),0px_4px_6px_-4px_rgba(0,0,0,0.1)] lg:px-5 lg:py-5",
            isSinglePage
              ? "w-full max-w-[420px] md:max-w-none"
              : "w-[min(260px,calc(100vw-64px))] shrink-0 snap-start sm:w-auto",
          );

          const cardElement = !canExpand ? (
            <div key={card.id} data-status-card className={cardClass}>
              {inner}
            </div>
          ) : (
            <button
              key={card.id}
              data-status-card
              type="button"
              aria-expanded={isOpen}
              onClick={() => setExpandedId(isOpen ? null : card.id)}
              className={cn(
                cardClass,
                "text-left transition-colors hover:bg-[#2A3346]",
                isOpen && "ring-1 ring-[#2E79FF]/40",
              )}
            >
              {inner}
            </button>
          );

          return isSinglePage ? (
            <div
              key={card.id}
              data-status-card-page
              className="flex w-[calc(100vw-32px)] shrink-0 snap-start justify-center md:w-auto md:snap-none"
            >
              {cardElement}
            </div>
          ) : (
            cardElement
          );
        })}

        {/* Desktop dropdown panel — absolute, escapes the grid flow */}
        {expandedCard && (
          <div className="absolute left-0 right-0 top-full z-30 mt-2 hidden lg:block">
            <div className="rounded-[16px] border border-white/5 bg-[#222A3B] p-4 shadow-[var(--shadow-dark-card)]">
              <p className="mb-3 text-[13px] font-bold text-white">
                {pickLocalized(expandedCard.label, locale)}
                {" — "}
                <span className="text-[#94A3B8]">
                  {pickLocalized(expandedCard.value, locale)}
                </span>
              </p>
              <ul className="space-y-2.5">
                {expandedCard.items.map((item) => (
                  <ItemRow
                    key={item.id}
                    item={item}
                    locale={locale}
                    variant="dark"
                  />
                ))}
              </ul>
            </div>
          </div>
        )}
      </div>

      {/* Mobile bottom-sheet — hidden on desktop via the display:none wrapper */}
      <div className="lg:hidden">
        <BottomSheet
          isOpen={isMobile && !!expandedCard}
          onClose={() => setExpandedId(null)}
          title={
            expandedCard ? pickLocalized(expandedCard.label, locale) : null
          }
        >
          {expandedCard && (
            <ul className="space-y-3">
              {expandedCard.items.map((item) => (
                <ItemRow
                  key={item.id}
                  item={item}
                  locale={locale}
                  variant="light"
                />
              ))}
            </ul>
          )}
        </BottomSheet>
      </div>
    </>
  );
}
