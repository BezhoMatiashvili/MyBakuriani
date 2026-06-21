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
  return (
    <li className="flex items-center justify-between gap-3 text-[14px]">
      <span className={cn("flex items-center gap-2 font-medium", labelColor)}>
        <StatusDot status={item.status} />
        {label}
      </span>
      {item.url ? (
        <a
          href={item.url}
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
}: {
  cards: StatusCard[];
  className?: string;
}) {
  const locale = useLocale();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  // Close the desktop dropdown when clicking outside the card grid / on Escape.
  useEffect(() => {
    if (!expandedId) return;
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
  }, [expandedId]);

  if (cards.length === 0) return null;

  const expandedCard = cards.find((c) => c.id === expandedId) ?? null;

  return (
    <>
      <div
        ref={gridRef}
        className={cn(
          "relative grid grid-cols-2 gap-4 sm:grid-cols-4",
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

          const cardClass =
            "flex items-center rounded-[16px] border border-white/5 bg-[#222A3B] px-3 py-5 shadow-[0px_10px_15px_-3px_rgba(0,0,0,0.1),0px_4px_6px_-4px_rgba(0,0,0,0.1)] md:px-5";

          if (!canExpand) {
            return (
              <div key={card.id} className={cardClass}>
                {inner}
              </div>
            );
          }

          return (
            <button
              key={card.id}
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
        })}

        {/* Desktop dropdown panel — absolute, escapes the grid flow */}
        {expandedCard && (
          <div className="absolute left-0 right-0 top-full z-30 mt-2 hidden md:block">
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
      <div className="md:hidden">
        <BottomSheet
          isOpen={!!expandedCard}
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
